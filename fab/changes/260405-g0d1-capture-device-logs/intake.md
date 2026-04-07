# Intake: Capture & Display Device Logs

**Change**: 260405-g0d1-capture-device-logs
**Created**: 2026-04-05
**Status**: Draft

## Origin

> User requested device log capture per test (Android logcat + iOS system log), mirroring the existing recording pipeline. A detailed implementation plan was collaboratively developed covering architecture, file changes, and verification strategy.

The change was designed through a conversational planning session that produced a comprehensive plan covering ~21 file changes across 4 packages. Key architectural decisions were made by explicitly mirroring the existing recording pipeline (RecordingManager, RecordingProvider, AndroidRecordingProvider, IOSRecordingProvider).

## Why

1. **Problem**: When a test fails, users must reproduce locally and manually run `adb logcat` / `xcrun simctl spawn log stream` to see what the OS and app printed. This adds significant debugging time and requires device access.
2. **Consequence**: Without captured logs, crash diagnostics, ANR traces, and app-level print statements are invisible in the test report. Users lose context they need to fix failures.
3. **Approach**: Mirror the recording pipeline end-to-end — same lifecycle (per-test start/stop), same manager/provider pattern, same artifact flow through ReportWriter. This minimizes design risk and keeps the codebase consistent.

## What Changes

### New Types (`packages/common`)

- Add `DeviceLogCaptureResult` interface (`filePath`, `startedAt`, `completedAt`) in a new `DeviceLog.ts` model, re-exported from `models/index.ts`
- Extend `TestResult` with three fields after `recordingCompletedAt`:
  ```ts
  deviceLogFile?: string;          // e.g. "tests/auth-login/device.log"
  deviceLogStartedAt?: string;
  deviceLogCompletedAt?: string;
  ```
- Bump `RunManifest.schemaVersion` from `2` to `3`

### Log Capture Engine (`packages/device-node`)

New files mirroring the recording architecture:

- **`LogCaptureProvider.ts`** — interface mirroring `RecordingProvider`:
  ```ts
  export interface LogCaptureProvider {
    startLogCapture(params: { deviceId, outputFilePath }): Promise<{ process, response }>;
    stopLogCapture(params: { process, outputFilePath }): Promise<DeviceNodeResponse>;
    checkAvailability(): Promise<DeviceNodeResponse>;
    cleanupPlatformResources(deviceId: string): Promise<void>;
    readonly fileExtension: string;   // ".log"
    readonly platformName: string;
  }
  ```

- **`AndroidLogcatProvider.ts`**:
  - Clear ring buffer before capture: `adb -s <serial> logcat -c` via `AdbClient.runCommand()`
  - Spawn `adb -s <serial> logcat -v threadtime` piping stdout to `fs.createWriteStream(outputFilePath)`
  - Stop via `process.kill('SIGINT')` + `_waitForExit` pattern from `AndroidRecordingProvider.ts`

- **`IOSLogProvider.ts`**:
  - Spawn `xcrun simctl spawn <udid> log stream --style compact` piping stdout to write stream
  - Same SIGINT + waitForExit pattern as `IOSRecordingProvider.ts`

- **`LogCaptureManager.ts`** — state-tracking mirroring `RecordingManager.ts`:
  - Maps: `_logProcessMap`, `_logInfoMap`, `_deviceToLogKeysMap` (keyed by `runId###testId`)
  - Methods: `startLogCapture`, `stopLogCapture`, `abortLogCapture`, `cleanupDevice`
  - Output path: `<tmpDir>/finalrun-logs/{runId}_{testId}.log` (NOT directly into report dir)

- **`Device.ts`** — four new methods parallel to recording:
  ```ts
  async startLogCapture(request): Promise<DeviceNodeResponse>
  async stopLogCapture(runId, testId): Promise<DeviceNodeResponse>
  async abortLogCapture(runId, keepPartialOnFailure): Promise<void>
  async logCaptureCleanUp(): Promise<void>
  ```
  Call `logCaptureCleanUp()` from `closeConnection()` after `recordingCleanUp()`.

- **`DeviceNode.ts`** — instantiate `LogCaptureManager` alongside `RecordingManager`, pass to `Device`.

### Orchestration (`packages/cli`)

- **`sessionRunner.ts`** — in `executeTestOnSession()`, add parallel `activeLogCapture` block next to `activeRecording`:
  - Start: `if (config.deviceLog) { startLogCapture … }`. Failure to start is **not fatal** — log warn and continue.
  - Stop: returns `{ filePath, startedAt, completedAt }` into `deviceLog` field on `TestExecutionResult`.
  - Finally: `abortLogCapture` next to `abortRecording`.

- **`testRunner.ts`** — build `deviceLog` config alongside `recording` config. Enable unconditionally on both platforms.

- **`TestExecutionResult`** — add `deviceLog?: DeviceLogCaptureResult` field parallel to `recording?`.

### Artifact Writing (`packages/cli`)

- **`reportWriter.ts`**:
  - New `_copyLogArtifact(testId, deviceLog)` method:
    1. Target: `path.posix.join('tests', testId, 'device.log')`
    2. After copy: **read → redact → write** using `redactResolvedValue` from `packages/common/src/repoPlaceholders.ts`
    3. Size guard: warn if raw file > 50 MB (redaction holds whole file in memory)
  - In `writeTestRecord()`: call `_copyLogArtifact` after `_copyRecordingArtifact`, add three new fields to `testRecord`
  - Apply same fields to the `buildTestRecord` helper (~line 640-663)

### Report Display (`packages/report-web` + `packages/cli`)

- **`renderers.ts`**: transform `deviceLogFile` → full artifact route; render inline collapsible section:
  ```html
  <details class="device-log">
    <summary>Device log (tail)</summary>
    <pre>{last ~200 lines, HTML-escaped}</pre>
    <a href="{deviceLogRoute}" download>Download full log</a>
  </details>
  ```
  Tail read is server-side: read file, split `\n`, take last 200 lines, HTML-escape. Missing file → render nothing.

- **`artifacts.ts`**: accept schema version `3` (and still accept `2`).

- **`reportTemplate.ts`**: add same `<details>` block next to the `<video>` tag.

## Affected Memory

- `device-node/log-capture`: (new) LogCaptureManager, providers, Device integration for per-test device log capture
- `cli/report-writer`: (modify) artifact copying with write-then-redact for device logs
- `report-web/renderers`: (modify) inline collapsible device log viewer in HTML reports

## Impact

- **packages/common**: New model type, TestResult extension, schema version bump
- **packages/device-node**: New provider interface + 2 platform implementations + manager + Device methods
- **packages/cli**: sessionRunner orchestration, testRunner config, reportWriter artifact handling, reportTemplate HTML
- **packages/report-web**: renderers display, artifacts schema version acceptance
- **Backward compatibility**: v2 reports still render (deviceLogFile === undefined → section absent)
- **Process cleanup**: SIGINT-based stop + abort ensures no orphaned `adb logcat` / `simctl spawn` processes

## Open Questions

- None — all design decisions resolved during planning session.

## Clarifications

### Session 2026-04-05 (bulk confirm)

| # | Action | Detail |
|---|--------|--------|
| 10 | Confirmed | — |
| 11 | Confirmed | — |
| 12 | Confirmed | — |
| 13 | Confirmed | — |

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Per-test lifecycle (start/stop around each test) | Discussed — user confirmed, matches recording pipeline | S:95 R:70 A:90 D:95 |
| 2 | Certain | Mirror recording pipeline architecture exactly | Discussed — user chose this for consistency and reduced design risk | S:95 R:60 A:95 D:90 |
| 3 | Certain | Bump RunManifest.schemaVersion 2 → 3 | Discussed — new fields on TestResult require schema bump | S:95 R:50 A:95 D:95 |
| 4 | Certain | Both Android and iOS from the start | Discussed — user confirmed both platforms despite recording being Android-only today | S:95 R:60 A:85 D:90 |
| 5 | Certain | Write-then-redact approach for secrets | Discussed — stream raw to disk during capture, read → redact → rewrite after stop | S:95 R:40 A:90 D:85 |
| 6 | Certain | Inline collapsible viewer with tail ~200 lines + download link | Discussed — user specified HTML details element with server-side tail read | S:95 R:80 A:85 D:90 |
| 7 | Certain | Log capture start failure is not fatal | Discussed — unlike recording, failure to start logs should warn and continue | S:90 R:85 A:80 D:85 |
| 8 | Certain | Output to temp dir, ReportWriter copies to report dir | Discussed — device-node doesn't know report layout, mirrors recording flow | S:90 R:70 A:90 D:90 |
| 9 | Confident | 50 MB size guard for redaction (warn, still process) | Plan specifies this threshold — reasonable but could be tuned | S:80 R:85 A:70 D:75 |
| 10 | Certain | Use `adb logcat -v threadtime` format | Clarified — user confirmed | S:95 R:90 A:75 D:70 |
| 11 | Certain | Use `xcrun simctl spawn <udid> log stream --style compact` | Clarified — user confirmed | S:95 R:90 A:75 D:70 |
| 12 | Certain | Clear logcat ring buffer before capture with `logcat -c` | Clarified — user confirmed | S:95 R:85 A:80 D:80 |
| 13 | Certain | Enable log capture unconditionally (no user flag) | Clarified — user confirmed | S:95 R:85 A:65 D:70 |

13 assumptions (12 certain, 1 confident, 0 tentative, 0 unresolved).
