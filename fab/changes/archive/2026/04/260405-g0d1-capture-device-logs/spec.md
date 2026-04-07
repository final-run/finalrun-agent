# Spec: Capture & Display Device Logs

**Change**: 260405-g0d1-capture-device-logs
**Created**: 2026-04-05
**Affected memory**: `docs/memory/device-node/log-capture.md`, `docs/memory/cli/report-writer.md`, `docs/memory/report-web/renderers.md`

## Non-Goals

- Log filtering or search in the report viewer — full-text search is out of scope
- Log level colorization or syntax highlighting in the `<pre>` block
- User-configurable log format (threadtime / compact are fixed per platform)
- Streaming logs to the report in real-time during test execution

## Common: Types & Schema

### Requirement: DeviceLogCaptureResult type
The system SHALL export a `DeviceLogCaptureResult` interface from `packages/common/src/models/DeviceLog.ts` with fields `filePath: string`, `startedAt: string`, and `completedAt: string`.

#### Scenario: Import from common barrel
- **GIVEN** a consumer imports from `@finalrun/common`
- **WHEN** it references `DeviceLogCaptureResult`
- **THEN** the type is available as a named export

### Requirement: TestResult extension
The `TestResult` interface SHALL include three new optional fields after `recordingCompletedAt`: `deviceLogFile?: string`, `deviceLogStartedAt?: string`, `deviceLogCompletedAt?: string`.

#### Scenario: Test with device log
- **GIVEN** a test execution that captured device logs
- **WHEN** the test result is written to run.json
- **THEN** `deviceLogFile` contains the relative path (e.g., `tests/auth-login/device.log`)
- **AND** `deviceLogStartedAt` and `deviceLogCompletedAt` contain ISO timestamps

#### Scenario: Test without device log
- **GIVEN** a test execution where log capture was not available or failed to start
- **WHEN** the test result is written to run.json
- **THEN** `deviceLogFile`, `deviceLogStartedAt`, and `deviceLogCompletedAt` are `undefined`

### Requirement: Schema version bump
`RunManifest.schemaVersion` SHALL be bumped from `2` to `3`. The `schemaVersion` type SHALL be `2 | 3` to maintain backward compatibility for any code that constructs v2 manifests.

#### Scenario: New run produces v3 manifest
- **GIVEN** a test run completes
- **WHEN** run.json is written
- **THEN** `schemaVersion` is `3`

## Device-Node: Log Capture Provider Interface

### Requirement: LogCaptureProvider interface
A `LogCaptureProvider` interface SHALL be defined in `packages/device-node/src/device/LogCaptureProvider.ts` mirroring `RecordingProvider`. It SHALL declare:
- `startLogCapture(params: { deviceId: string; outputFilePath: string }): Promise<{ process: ChildProcess; response: DeviceNodeResponse }>`
- `stopLogCapture(params: { process: ChildProcess; outputFilePath: string }): Promise<DeviceNodeResponse>`
- `checkAvailability(): Promise<DeviceNodeResponse>`
- `cleanupPlatformResources(deviceId: string): Promise<void>`
- `readonly fileExtension: string` (always `"log"`)
- `readonly platformName: string`

#### Scenario: Provider interface contract
- **GIVEN** a class implements `LogCaptureProvider`
- **WHEN** it is used by `LogCaptureManager`
- **THEN** all methods are callable with the specified signatures

## Device-Node: Android Logcat Provider

### Requirement: Ring buffer clearing
`AndroidLogcatProvider` SHALL clear the logcat ring buffer before starting capture by running `adb -s <serial> logcat -c` via an injected `execFile` function (matching the `AndroidRecordingProvider` pattern, not `AdbClient`).
<!-- clarified: AndroidRecordingProvider uses injected execFileFn, not AdbClient — resolved from codebase (AndroidRecordingProvider.ts:13-18) -->

#### Scenario: Clean capture start
- **GIVEN** a device with pre-existing logcat output in the ring buffer
- **WHEN** `startLogCapture` is called
- **THEN** the ring buffer is cleared before the capture process spawns
- **AND** the captured log file does NOT contain output from before the test started

### Requirement: Logcat process spawn
`AndroidLogcatProvider` SHALL spawn `adb -s <serial> logcat -v threadtime` with `stdio: ['ignore', <writeStream>, 'pipe']`, piping stdout directly to a `fs.createWriteStream(outputFilePath)`.

#### Scenario: Log file written during capture
- **GIVEN** a running Android device producing logcat output
- **WHEN** `startLogCapture` is called and the app is exercised
- **THEN** logcat output is streamed to the output file in threadtime format

### Requirement: SIGINT stop
`AndroidLogcatProvider` SHALL stop the logcat process via `process.kill('SIGINT')` and wait for exit using the `_waitForExit` pattern (matching `AndroidRecordingProvider`). After exit, the write stream SHALL be flushed and closed before resolving.

#### Scenario: Graceful stop
- **GIVEN** an active logcat capture process
- **WHEN** `stopLogCapture` is called
- **THEN** SIGINT is sent to the process
- **AND** the method waits for the process to exit
- **AND** the write stream is closed
- **AND** the response includes `success: true`

## Device-Node: iOS Log Provider

### Requirement: iOS log stream spawn
`IOSLogProvider` SHALL spawn `xcrun simctl spawn <udid> log stream --style compact` with stdout piped to `fs.createWriteStream(outputFilePath)`.

#### Scenario: iOS log capture
- **GIVEN** a booted iOS simulator
- **WHEN** `startLogCapture` is called
- **THEN** system log output is streamed to the output file in compact format

### Requirement: iOS SIGINT stop
`IOSLogProvider` SHALL stop the log stream via `process.kill('SIGINT')` and wait for exit using the `_waitForExit` pattern (matching `IOSRecordingProvider`).

#### Scenario: Graceful iOS stop
- **GIVEN** an active iOS log stream process
- **WHEN** `stopLogCapture` is called
- **THEN** SIGINT is sent and the method waits for exit
- **AND** the write stream is closed

## Device-Node: Log Capture Manager

### Requirement: State tracking maps
`LogCaptureManager` SHALL maintain three maps mirroring `RecordingManager`:
- `_logProcessMap: Map<string, ChildProcess>` keyed by `{runId}###{testId}`
- `_logInfoMap: Map<string, LogInfo>` with `deviceId`, `filePath`, `startedAt`
- `_deviceToLogKeysMap: Map<string, string[]>` mapping deviceId to active keys

#### Scenario: Concurrent test log capture
- **GIVEN** two tests running on different devices
- **WHEN** both have active log captures
- **THEN** each has independent entries in the process and info maps

### Requirement: Output path convention
Log files SHALL be written to `<tmpDir>/finalrun-logs/{sanitizedRunId}_{sanitizedTestId}.log`. The `LogCaptureManager` SHALL NOT write directly into the report directory.

#### Scenario: Temp file location
- **GIVEN** a log capture is started with runId `run-1` and testId `auth/login`
- **WHEN** the output path is computed
- **THEN** it is under the system temp directory, NOT the report directory

### Requirement: startLogCapture method
`LogCaptureManager.startLogCapture()` SHALL select the platform provider, create the output directory, spawn the capture process, and store state in the maps. It SHALL return a `DeviceNodeResponse` with `filePath` and `startedAt` in the `data` field.

#### Scenario: Start succeeds
- **GIVEN** a valid deviceId and platform
- **WHEN** `startLogCapture` is called
- **THEN** the provider's `startLogCapture` is invoked
- **AND** the process and info are stored in maps
- **AND** the response contains `success: true` with `filePath` and `startedAt`

### Requirement: stopLogCapture method
`LogCaptureManager.stopLogCapture()` SHALL look up the process by `runId###testId`, call the provider's `stopLogCapture`, clean up map entries, and return a response with `filePath`, `startedAt`, `completedAt`.

#### Scenario: Stop succeeds
- **GIVEN** an active log capture for a test
- **WHEN** `stopLogCapture` is called with matching runId and testId
- **THEN** the provider stops the process
- **AND** map entries are cleaned up
- **AND** response includes `completedAt` timestamp

### Requirement: abortLogCapture method
`LogCaptureManager.abortLogCapture()` SHALL find all captures matching runId and deviceId, stop each with configurable `keepOutput`, and clean up state.

#### Scenario: Abort on test failure
- **GIVEN** an active log capture
- **WHEN** `abortLogCapture` is called with `keepOutput: true`
- **THEN** the process is stopped
- **AND** the partial log file is preserved

### Requirement: cleanupDevice method
`LogCaptureManager.cleanupDevice()` SHALL stop all captures for the device, delete map entries, and call `provider.cleanupPlatformResources()`.

#### Scenario: Device disconnection cleanup
- **GIVEN** a device with active log captures
- **WHEN** `cleanupDevice` is called
- **THEN** all capture processes are stopped
- **AND** all map entries for the device are removed

## Device-Node: Device Integration

### Requirement: Device log capture methods
`Device` SHALL expose four methods parallel to the recording methods:
- `startLogCapture(request)` — delegates to `LogCaptureManager`
- `stopLogCapture(runId, testId)` — delegates to `LogCaptureManager`
- `abortLogCapture(runId, keepPartialOnFailure)` — delegates to `LogCaptureManager`
- `logCaptureCleanUp()` — delegates to `LogCaptureManager.cleanupDevice()`

#### Scenario: Cleanup on close
- **GIVEN** a device with active log captures
- **WHEN** `closeConnection()` is called
- **THEN** `logCaptureCleanUp()` is called after `recordingCleanUp()`
- **AND** no orphaned capture processes remain

### Requirement: DeviceNode instantiation
`GrpcDriverSetup.setUp()` (which constructs `Device` instances on behalf of `DeviceNode`) SHALL pass a `LogCaptureManager` into the `Device` constructor alongside the existing `RecordingManager` injection.
<!-- clarified: Device is constructed in GrpcDriverSetup.setUp(), not directly in DeviceNode — resolved from codebase (GrpcDriverSetup.ts:103) -->

#### Scenario: Device receives log capture controller
- **GIVEN** a new Device is created via DeviceNode
- **WHEN** the Device constructor runs
- **THEN** both recording and log capture controllers are available

## CLI: Orchestration

### Requirement: TestSessionConfig extension
`TestSessionConfig` SHALL include a new optional `deviceLog` field: `{ runId: string; testId: string; keepPartialOnFailure?: boolean }`.

#### Scenario: Config with device log enabled
- **GIVEN** a test session config is built
- **WHEN** `deviceLog` is provided
- **THEN** the session runner starts log capture

### Requirement: Non-fatal log capture start
In `executeTestOnSession()`, failure to start log capture SHALL log a warning and continue test execution. This is unlike recording, where start failure MAY be fatal on some platforms.

#### Scenario: Log capture start fails
- **GIVEN** the device does not support log capture (e.g., tool not found)
- **WHEN** `startLogCapture` returns `success: false`
- **THEN** a warning is logged
- **AND** the test proceeds without log capture
- **AND** `deviceLog` on `TestExecutionResult` is `undefined`

### Requirement: Log capture lifecycle in executeTestOnSession
The session runner SHALL start log capture before test execution (parallel to recording start), stop it after execution (parallel to recording stop), and abort in the finally block (parallel to recording abort).

#### Scenario: Successful test with log capture
- **GIVEN** a test session with `deviceLog` config
- **WHEN** the test executes successfully
- **THEN** log capture starts before test execution
- **AND** log capture stops after test execution
- **AND** `TestExecutionResult.deviceLog` contains `{ filePath, startedAt, completedAt }`

#### Scenario: Test aborted mid-execution
- **GIVEN** an active log capture during test execution
- **WHEN** the test is aborted (Ctrl+C or timeout)
- **THEN** `abortLogCapture` is called in the finally block with `keepPartialOnFailure`
- **AND** no orphaned log capture process remains

### Requirement: TestExecutionResult extension
`TestExecutionResult` (in `packages/goal-executor/src/TestExecutor.ts`) SHALL include a new `deviceLog?: DeviceLogCaptureResult` field parallel to `recording?`.
<!-- clarified: TestExecutionResult lives in goal-executor, not cli — resolved from codebase context -->

### Requirement: Unconditional enablement
`testRunner.ts` SHALL build `deviceLog` config for every test on both platforms. Log capture is always-on without a user flag.

#### Scenario: Both platforms get log capture config
- **GIVEN** a test run on Android or iOS
- **WHEN** the per-test session config is built
- **THEN** `deviceLog` is populated with `runId`, `testId`, and `keepPartialOnFailure: true`

## CLI: Report Writing

### Requirement: _copyLogArtifact method
`ReportWriter` SHALL implement `_copyLogArtifact(testId, deviceLog)` that:
1. Computes target path as `path.posix.join('tests', testId, 'device.log')`
2. Copies the source file to the target path
3. Reads the copied file, applies `redactResolvedValue()` from `@finalrun/common`, and writes back
4. Returns the relative path string or `undefined` if source is missing

#### Scenario: Log artifact with secrets redacted
- **GIVEN** a device log file containing a resolved secret value (e.g., `user@test.com`)
- **WHEN** `_copyLogArtifact` processes the file
- **THEN** the secret is replaced with its placeholder (e.g., `${secrets.email}`)
- **AND** the file in the report directory contains only redacted content

#### Scenario: Missing source file
- **GIVEN** no device log file exists (log capture failed or was not started)
- **WHEN** `_copyLogArtifact` is called
- **THEN** it returns `undefined`
- **AND** no error is thrown

### Requirement: Size guard for redaction
If the raw log file exceeds 50 MB, `_copyLogArtifact` SHALL log a warning but still process the file.

#### Scenario: Large log file
- **GIVEN** a device log file that is 60 MB
- **WHEN** `_copyLogArtifact` processes it
- **THEN** a warning is logged about the file size
- **AND** redaction still proceeds

### Requirement: writeTestRecord integration
`writeTestRecord()` SHALL call `_copyLogArtifact` after `_copyRecordingArtifact` and populate `deviceLogFile`, `deviceLogStartedAt`, `deviceLogCompletedAt` on the `TestResult` object.

#### Scenario: Test record with device log
- **GIVEN** a test execution result with `deviceLog` data
- **WHEN** `writeTestRecord` builds the `TestResult`
- **THEN** `deviceLogFile` is set to the relative path from `_copyLogArtifact`
- **AND** timestamps are set from `result.deviceLog`

## Report-Web: Display

### Requirement: Schema version acceptance
`loadRunManifestRecord()` in `artifacts.ts` SHALL accept schema versions `2` and `3`. Version 2 manifests load without error (device log fields are simply `undefined`).

#### Scenario: Load v2 manifest
- **GIVEN** a run.json with `schemaVersion: 2`
- **WHEN** `loadRunManifestRecord` is called
- **THEN** the manifest loads successfully
- **AND** no device log fields are present on test records

#### Scenario: Load v3 manifest
- **GIVEN** a run.json with `schemaVersion: 3`
- **WHEN** `loadRunManifestRecord` is called
- **THEN** the manifest loads with device log fields available

### Requirement: View model transformation
`toTestViewModel()` in `renderers.ts` SHALL transform `deviceLogFile` using `buildRunScopedArtifactPath(runId, test.deviceLogFile)` to produce the full artifact route.

#### Scenario: Device log route in view model
- **GIVEN** a test with `deviceLogFile: "tests/auth-login/device.log"`
- **WHEN** `toTestViewModel` transforms the test
- **THEN** `deviceLogFile` becomes a full artifact route path

### Requirement: Inline collapsible viewer
The report SHALL render an inline collapsible `<details>` section for each test that has a device log:
```html
<details class="device-log">
  <summary>Device log (tail)</summary>
  <pre>{last ~200 lines, HTML-escaped}</pre>
  <a href="{deviceLogRoute}" download>Download full log</a>
</details>
```

#### Scenario: Test with device log in report
- **GIVEN** a test result with `deviceLogFile` set
- **WHEN** the HTML report is rendered
- **THEN** a `<details class="device-log">` element appears
- **AND** the `<pre>` contains the last ~200 lines of the log, HTML-escaped
- **AND** a download link points to the full log file

#### Scenario: Test without device log in report
- **GIVEN** a test result with `deviceLogFile` undefined
- **WHEN** the HTML report is rendered
- **THEN** no device log section is rendered for that test

### Requirement: Server-side tail read
The tail read SHALL happen server-side during HTML rendering: read the device log file, split on `\n`, take the last 200 lines, and HTML-escape the content.

#### Scenario: Log file with 500 lines
- **GIVEN** a device.log file with 500 lines
- **WHEN** the report HTML is generated
- **THEN** the `<pre>` block contains exactly the last 200 lines

## CLI: Report Template

### Requirement: Device log in report template
`reportTemplate.ts` SHALL render the same `<details>` block next to the `<video>` tag for the recording, using `escapeHtml` for the log content.

#### Scenario: CLI-generated report with device log
- **GIVEN** a test result with `deviceLogFile`
- **WHEN** `reportTemplate.ts` generates the HTML
- **THEN** the device log `<details>` block appears after the recording section

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Per-test lifecycle (start/stop around each test) | Confirmed from intake #1 — matches recording pipeline | S:95 R:70 A:90 D:95 |
| 2 | Certain | Mirror recording pipeline architecture exactly | Confirmed from intake #2 — consistency and reduced design risk | S:95 R:60 A:95 D:90 |
| 3 | Certain | Bump RunManifest.schemaVersion 2 → 3 | Confirmed from intake #3 — new TestResult fields require schema bump | S:95 R:50 A:95 D:95 |
| 4 | Certain | Both Android and iOS from the start | Confirmed from intake #4 | S:95 R:60 A:85 D:90 |
| 5 | Certain | Write-then-redact approach for secrets | Confirmed from intake #5 — stream raw, redact after stop | S:95 R:40 A:90 D:85 |
| 6 | Certain | Inline collapsible viewer with tail ~200 lines + download link | Confirmed from intake #6 | S:95 R:80 A:85 D:90 |
| 7 | Certain | Log capture start failure is not fatal | Confirmed from intake #7 — warn and continue | S:90 R:85 A:80 D:85 |
| 8 | Certain | Output to temp dir, ReportWriter copies to report dir | Confirmed from intake #8 — mirrors recording flow | S:90 R:70 A:90 D:90 |
| 9 | Confident | 50 MB size guard for redaction (warn, still process) | Carried from intake #9 — reasonable threshold | S:80 R:85 A:70 D:75 |
| 10 | Certain | Use `adb logcat -v threadtime` format | Clarified from intake #10 — user confirmed | S:95 R:90 A:75 D:70 |
| 11 | Certain | Use `xcrun simctl spawn <udid> log stream --style compact` | Clarified from intake #11 — user confirmed | S:95 R:90 A:75 D:70 |
| 12 | Certain | Clear logcat ring buffer before capture with `logcat -c` | Clarified from intake #12 — user confirmed | S:95 R:85 A:80 D:80 |
| 13 | Certain | Enable log capture unconditionally (no user flag) | Clarified from intake #13 — user confirmed | S:95 R:85 A:65 D:70 |
| 14 | Certain | LogCaptureManager uses same map key delimiter `###` as RecordingManager | Codebase pattern — RecordingManager.ts:50 uses `###` | S:95 R:90 A:95 D:95 |
| 15 | Certain | DeviceLogCaptureResult uses same timestamp format (ISO 8601) as recording | Codebase pattern — RecordingManager returns `toISOString()` | S:95 R:90 A:95 D:95 |
| 16 | Certain | Schema version type becomes union `2 | 3` for backward compat | Codebase — RunManifest.ts:65 currently uses literal `2` | S:90 R:70 A:90 D:90 |
| 17 | Certain | Device log `<details>` block positioned after recording section | Layout convention — recording is the primary media, log is supplementary | S:85 R:90 A:80 D:85 |

17 assumptions (16 certain, 1 confident, 0 tentative, 0 unresolved).
