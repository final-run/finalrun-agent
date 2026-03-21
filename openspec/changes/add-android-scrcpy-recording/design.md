# Design

## Current State

The current recording flow is already structured around a platform-specific provider interface:

- `packages/cli/src/goalRunner.ts` starts and stops session recording around a single spec run
- `packages/device-node/src/device/Device.ts` delegates recording to `RecordingManager`
- `packages/device-node/src/device/RecordingManager.ts` handles path creation, active-session bookkeeping, and cleanup
- `packages/device-node/src/device/IOSRecordingProvider.ts` owns the iOS-specific subprocess lifecycle

Android is excluded in one visible place today: `goalRunner` only starts recording when the platform is not Android. `RecordingManager` also only registers an iOS provider by default.

The downstream artifact pipeline is already compatible with Android video output:

- `packages/cli/src/reportWriter.ts` copies the recording file using its existing extension
- `packages/cli/src/reportTemplate.ts` renders a generic HTML `<video>` element

That means Android recording is mostly a provider integration problem, not a reporting problem.

## Recommended Flow

```text
goalRunner
  -> Device.startRecording()
  -> RecordingManager.startRecording()
  -> AndroidRecordingProvider.startRecordingProcess()
  -> spawn scrcpy for the selected adb device

goalRunner
  -> Device.stopRecording() / abortRecording()
  -> RecordingManager.stopRecording() / cleanupDevice()
  -> AndroidRecordingProvider.stopRecordingProcess()
  -> send SIGINT to scrcpy
  -> wait for exit
  -> keep or delete the output file based on existing manager semantics
```

## scrcpy Command Shape

Use `scrcpy` as a headless host-side recorder bound to the device serial already known to FinalRun.

Recommended command shape:

```sh
scrcpy \
  --serial <deviceId> \
  --no-window \
  --no-playback \
  --no-control \
  --no-audio \
  --record <filePath> \
  --record-format mp4
```

Rationale:

- `--serial <deviceId>` is required so recording targets the same device FinalRun already selected
- `--no-window` avoids opening a local mirror window
- `--no-playback` prevents local playback work we do not need for artifact capture
- `--no-control` keeps the recorder read-only and avoids accidental input interference
- `--no-audio` keeps behavior deterministic across devices and closer to the current iOS recording expectations
- `--record <filePath>` writes directly to the artifact path managed by `RecordingManager`
- `--record-format mp4` makes the container explicit instead of inferring it from extension alone

## Provider Design

Create `AndroidRecordingProvider` beside the iOS provider.

Provider contract:

- `platformName`: `android`
- `recordingFolder`: `fr_android_screen_recording`
- `fileExtension`: `mp4`

### Start Behavior

`startRecordingProcess()` should:

1. check that `scrcpy` is available on `PATH` using a lightweight command such as `which scrcpy` or `scrcpy --version`
2. build the `scrcpy` command using the device serial and output path
3. spawn the process with piped stdout/stderr for log capture
4. wait for the child process to spawn
5. wait through a short readiness window so immediate startup failures are surfaced before reporting success
6. return the live child process and platform metadata

The readiness window matters because a raw spawn success is not enough. `scrcpy` may exit immediately for reasons such as:

- device disconnected
- device unauthorized
- adb unavailable
- recording path failure

If the process exits during that readiness window, the provider should treat startup as failed and include stderr in the error message when available.

### Stop Behavior

`stopRecordingProcess()` should:

1. send `SIGINT` to the `scrcpy` process
2. wait for it to exit
3. verify that the expected output file exists
4. optionally verify the file is non-empty
5. return a success response if the file is present

Unlike iOS, there is no required post-processing step in v1. The manager already handles deletion for aborted runs when `keepOutput` is `false`.

### Availability and Cleanup

`checkAvailability()` should verify that `scrcpy` is available. It does not need to validate every device up front.

`cleanupPlatformResources()` can remain a no-op for v1 because `RecordingManager` already tracks and stops the child processes it started.

## RecordingManager Changes

Update the default provider map to include both:

- `ios -> IOSRecordingProvider`
- `android -> AndroidRecordingProvider`

No structural changes are required in the manager itself. It already supports:

- provider lookup by platform
- deterministic output directories and filenames
- one active recording per test case
- abort/cleanup deletion behavior

Android output should land under:

```text
<cwd>/fr_android_screen_recording/<sanitized-test-run>_<sanitized-test-case>.mp4
```

## Goal Runner Changes

Remove the Android exclusion in `packages/cli/src/goalRunner.ts` so both platforms attempt recording through the same flow.

Failure semantics are intentionally different for Android in v1:

- if Android recording fails to start, do not execute the spec
- if Android recording fails to stop or returns no file path, mark the spec as failed
- if the run is cancelled, abort the recording and delete the local partial output

This keeps the new Android behavior aligned with the requirement that a device run must produce video, while leaving the current iOS behavior unchanged.

## Bit Rate Handling

`RecordingRequest.bitRate` currently defaults to `1000000`. `scrcpy` defaults to `8M`. If Android blindly passes the current request default through `--video-bit-rate`, recorded video quality may be significantly lower than what operators expect from `scrcpy`.

Resolved v1 approach:

- do not pass `--video-bit-rate` for Android
- leave `scrcpy` on its built-in default for now

That keeps Android video quality closer to normal `scrcpy` expectations until FinalRun defines an explicit recording-quality contract.

## Test Plan

Add or update tests for:

- `AndroidRecordingProvider` spawns `scrcpy` with the expected serial, headless flags, and output path
- startup fails when the child exits during the readiness window
- stop sends `SIGINT` and succeeds when the output file exists
- `RecordingManager` creates sanitized Android output paths ending in `.mp4`
- `RecordingManager` reports unsupported platforms only when no provider is configured
- `goalRunner` attempts recording on Android once the platform guard is removed
- report writing continues to accept non-`.mov` recording files

## Risks

- `scrcpy` is an external host dependency, so missing binaries or PATH issues must degrade gracefully
- multiple adb devices require strict use of `--serial`
- very short or failed runs may leave partial files if the process exits before the manager reaches normal stop logic
- Android emulator and physical-device behavior should both work, but startup error handling must be resilient because `scrcpy` failure messages vary

## Resolved Decisions

1. v1 supports both physical devices and emulators as long as they are visible through `adb devices`.
2. Android recordings stay video-only in v1.
3. Android recording is required when recording is requested, so start/stop failure fails the spec.
4. `scrcpy` on `PATH` is sufficient in v1; configurable binary paths can come later.
5. Android uses `scrcpy`'s default bitrate in v1 instead of the current `RecordingRequest.bitRate` default.
