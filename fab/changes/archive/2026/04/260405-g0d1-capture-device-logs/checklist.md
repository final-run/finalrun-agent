# Quality Checklist: Capture & Display Device Logs

**Change**: 260405-g0d1-capture-device-logs
**Generated**: 2026-04-05
**Spec**: `spec.md`

## Functional Completeness

- [x] CHK-001 DeviceLogCaptureResult type exported from `@finalrun/common`
- [x] CHK-002 TestResult has `deviceLogFile`, `deviceLogStartedAt`, `deviceLogCompletedAt` fields
- [x] CHK-003 RunManifest.schemaVersion accepts `2 | 3`; new runs write `3`
- [x] CHK-004 LogCaptureProvider interface defined with all required methods
- [x] CHK-005 AndroidLogcatProvider clears ring buffer, spawns `logcat -v threadtime`, SIGINT stop with write stream flush
- [x] CHK-006 IOSLogProvider spawns `simctl spawn log stream --style compact`, SIGINT stop
- [x] CHK-007 LogCaptureManager tracks state with three maps, implements start/stop/abort/cleanup
- [x] CHK-008 Device exposes `startLogCapture`, `stopLogCapture`, `abortLogCapture`, `logCaptureCleanUp`
- [x] CHK-009 `closeConnection()` calls `logCaptureCleanUp()` after `recordingCleanUp()`
- [x] CHK-010 GrpcDriverSetup injects LogCaptureManager into Device
- [x] CHK-011 TestSessionConfig has `deviceLog` field; sessionRunner implements non-fatal start, stop, abort in finally
- [x] CHK-012 TestExecutionResult has `deviceLog?: DeviceLogCaptureResult`
- [x] CHK-013 testRunner builds `deviceLog` config for both platforms unconditionally
- [x] CHK-014 `_copyLogArtifact` copies file, applies `redactResolvedValue`, 50MB size warning
- [x] CHK-015 `writeTestRecord` populates device log fields on TestResult
- [x] CHK-016 Schema version checks accept 2 and 3 in `artifacts.ts`, `reportServer.ts`, `runIndex.ts`
- [x] CHK-017 `toTestViewModel` transforms `deviceLogFile` via `buildRunScopedArtifactPath`
- [x] CHK-018 Report renders `<details class="device-log">` with tail 200 lines + download link
- [x] CHK-019 `reportTemplate.ts` renders device log `<details>` block next to `<video>` tag

## Behavioral Correctness

- [x] CHK-020 Log capture start failure does NOT abort test execution (warn only)
- [x] CHK-021 Ctrl+C / abort produces no orphaned `adb logcat` or `simctl spawn` processes
- [x] CHK-022 Secrets in device log are redacted via `redactResolvedValue` before writing to report dir
- [x] CHK-023 Tests without device log (missing file or failed start) render no device log section

## Scenario Coverage

- [x] CHK-024 Successful test with device log: file exists in report, TestResult fields populated, `<details>` rendered
- [x] CHK-025 Log capture start fails: warning logged, test proceeds, no device log in report
- [x] CHK-026 Test abort mid-execution: `abortLogCapture` called, partial file preserved if `keepPartialOnFailure`
- [x] CHK-027 v2 manifest loads without error in report-web (device log fields undefined)
- [x] CHK-028 v3 manifest loads with device log fields available
- [x] CHK-029 Large log file (>50MB): warning logged, redaction still runs

## Edge Cases & Error Handling

- [x] CHK-030 Missing device log source file: `_copyLogArtifact` returns undefined, no error thrown
- [x] CHK-031 Concurrent log captures on different devices tracked independently
- [x] CHK-032 Already-stopped log capture returns success (idempotent stop)

## Code Quality

- [x] CHK-033 Pattern consistency: LogCaptureManager mirrors RecordingManager structure (maps, key format, method signatures)
- [x] CHK-034 No unnecessary duplication: `_sanitizeForFilename`, `_waitForExit`, `_formatError` patterns reused appropriately

## Notes

- Check items as you review: `- [x]`
- All items must pass before `/fab-continue` (hydrate)
- If an item is not applicable, mark checked and prefix with **N/A**: `- [x] CHK-008 **N/A**: {reason}`
