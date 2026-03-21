# Add Android Screen Recording Via scrcpy

## Why

Android runs currently do not capture a session recording. The recording flow already exists for iOS, the report pipeline already knows how to copy and render video artifacts, and `goalRunner` already creates per-spec recording metadata. The main gap is that Android is explicitly skipped.

This creates an avoidable parity problem:

- iOS runs can attach a full-session recording
- Android runs cannot, even though the surrounding artifact pipeline is already in place
- local operators already have `scrcpy`, which can record an adb-visible Android device from the host without introducing a new device-side service

## Proposed Change

Add Android screen recording support using host-installed `scrcpy`.

The implementation should:

- add an `AndroidRecordingProvider` that implements the existing `RecordingProvider` contract
- register that provider in `RecordingManager`
- remove the Android exclusion in `packages/cli/src/goalRunner.ts`
- start a headless `scrcpy` recording for each spec when recording is enabled
- stop or abort the `scrcpy` process using the same lifecycle already used for iOS
- persist the resulting Android recording as an `.mp4` artifact for report generation

## Scope

- new Android recording provider in `packages/device-node/src/device`
- `RecordingManager` provider registration for `android`
- Android enablement in `packages/cli/src/goalRunner.ts`
- unit tests for provider behavior, manager wiring, and Android runner behavior
- small README note if recording behavior is documented there

## Non-Goals

- bundling or installing `scrcpy`
- adding a new user-facing CLI configuration surface for recording flags
- capturing Android audio in v1
- changing the existing iOS recording implementation
