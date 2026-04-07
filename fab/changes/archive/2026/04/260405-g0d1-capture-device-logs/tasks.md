# Tasks: Capture & Display Device Logs

**Change**: 260405-g0d1-capture-device-logs
**Spec**: `spec.md`
**Intake**: `intake.md`

## Phase 1: Setup — Types & Interfaces

- [x] T001 [P] Create `packages/common/src/models/DeviceLog.ts` with `DeviceLogCaptureResult` interface (`filePath`, `startedAt`, `completedAt`); re-export from `packages/common/src/index.ts` (no `models/index.ts` barrel exists — all model exports go through `packages/common/src/index.ts` directly)
- [x] T002 [P] Extend `TestResult` in `packages/common/src/models/TestResult.ts` with `deviceLogFile?: string`, `deviceLogStartedAt?: string`, `deviceLogCompletedAt?: string` after `recordingCompletedAt` (line 60)
- [x] T003 [P] Bump `RunManifest.schemaVersion` type in `packages/common/src/models/RunManifest.ts` from literal `2` to `2 | 3` (line 65); update the actual value written in `packages/cli/src/reportWriter.ts` from `2` to `3` (line 564)
- [x] T004 [P] Create `LogCaptureProvider` interface in `packages/device-node/src/device/LogCaptureProvider.ts` with `startLogCapture`, `stopLogCapture`, `checkAvailability`, `cleanupPlatformResources`, `fileExtension`, `platformName`

## Phase 2: Core Implementation — Providers & Manager

- [x] T005 [P] Create `AndroidLogcatProvider` in `packages/device-node/src/device/AndroidLogcatProvider.ts`: clear ring buffer via injected `execFile` (`adb -s <serial> logcat -c`), spawn `adb -s <serial> logcat -v threadtime` piping stdout to write stream, SIGINT stop with `_waitForExit`, flush/close write stream
- [x] T006 [P] Create `IOSLogProvider` in `packages/device-node/src/device/IOSLogProvider.ts`: spawn `xcrun simctl spawn <udid> log stream --style compact` piping stdout to write stream, SIGINT stop with `_waitForExit`
- [x] T008 [P] Create `LogInfo` class in `packages/device-node/src/device/LogInfo.ts` mirroring `RecordingInfo.ts` with `deviceId`, `filePath`, `runId`, `testId`, `platform`, `startTime`, `endTime`, `markAsEnded()`
- [x] T007 Create `LogCaptureManager` in `packages/device-node/src/device/LogCaptureManager.ts` mirroring `RecordingManager.ts`: `_logProcessMap`, `_logInfoMap`, `_deviceToLogKeysMap` with `###` delimiter; methods `startLogCapture`, `stopLogCapture`, `abortLogCapture`, `cleanupDevice`; output path `<tmpDir>/finalrun-logs/{runId}_{testId}.log`

## Phase 3: Integration — Device, CLI, Report

- [x] T009 Add `DeviceLogCaptureController` interface and inject into `Device` in `packages/device-node/src/device/Device.ts`: add `startLogCapture`, `stopLogCapture`, `abortLogCapture`, `logCaptureCleanUp` methods; call `logCaptureCleanUp()` from `closeConnection()` after `recordingCleanUp()`
- [x] T010 Update `GrpcDriverSetup.setUp()` in `packages/device-node/src/grpc/GrpcDriverSetup.ts` to instantiate `LogCaptureManager` and pass to `Device` constructor; export from `packages/device-node/src/index.ts`
- [x] T011 Extend `TestSessionConfig` in `packages/cli/src/sessionRunner.ts` with `deviceLog?: { runId, testId, keepPartialOnFailure? }` field; add `activeLogCapture` block in `executeTestOnSession()` parallel to `activeRecording`: non-fatal start, stop with result capture, abort in finally block
- [x] T012 [P] Extend `TestExecutionResult` in `packages/goal-executor/src/TestExecutor.ts` with `deviceLog?: DeviceLogCaptureResult` field (depends only on T001)
- [x] T013 Update `testRunner.ts` in `packages/cli/src/testRunner.ts` to build `deviceLog` config for every test on both platforms with `keepPartialOnFailure: true`

## Phase 4: Report Writing & Display

- [x] T014 Add `_copyLogArtifact(testId, deviceLog)` to `packages/cli/src/reportWriter.ts`: copy to `tests/{testId}/device.log`, read→redact→write using `redactResolvedValue`, 50MB size warning; call from `writeTestRecord()` after `_copyRecordingArtifact`; populate `deviceLogFile`, `deviceLogStartedAt`, `deviceLogCompletedAt` on TestResult
- [x] T015 [P] Update schema version checks to accept versions `2` and `3` in all three locations: `packages/report-web/src/artifacts.ts` `loadRunManifestRecord()` (line 120), `packages/cli/src/reportServer.ts` (line 137), and `packages/cli/src/runIndex.ts` (line 23)
- [x] T016 [P] Update `toTestViewModel()` in `packages/report-web/src/renderers.ts` to transform `deviceLogFile` via `buildRunScopedArtifactPath`; add `<details class="device-log">` rendering with server-side tail read (last 200 lines, HTML-escaped) and download link
- [x] T017 [P] Add `<details class="device-log">` block to `packages/cli/src/reportTemplate.ts` next to the `<video>` tag, using `escapeHtml` for log content

---

## Execution Order

- T001–T004 are independent setup tasks (all [P])
- T005, T006, T008 depend on T004 (LogCaptureProvider interface) and are independent of each other (all [P])
- T007 depends on T004 (interface), T008 (LogInfo); concrete providers (T005/T006) are injected at instantiation time, not compile-time
- T009 depends on T007 (LogCaptureManager)
- T010 depends on T005, T006, T007, T009 (instantiates providers and passes to Device)
- T011 depends on T009 (Device log capture methods)
- T012 depends on T001 only (DeviceLogCaptureResult type) — can run in parallel with T009–T011
- T013 depends on T011 (TestSessionConfig extension)
- T014 depends on T001, T002 (types), T012 (TestExecutionResult.deviceLog)
- T015–T017 are independent display tasks (all [P]), depend on T002, T003 (schema/types)
