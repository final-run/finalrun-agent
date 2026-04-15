# Quality Checklist: Multi-Device Test Orchestration (v1: 2 Devices, Same Platform)

**Change**: 260415-1mzp-multi-device-orchestration
**Generated**: 2026-04-15
**Spec**: `spec.md`

<!--
  Derived from spec.md (11 domain sections, 7 design decisions, 23 assumptions) and
  fab/project/code-quality.md. ALL must pass before hydrate.
-->

## Functional Completeness
<!-- Every requirement in spec.md has working implementation -->

- [x] CHK-001 Workspace shape: `.finalrun/multi-device/` subtree parsed; `ensureWorkspaceDirectories()` accepts at least one of `tests/` or `multi-device/tests/`; clear error when both absent.
- [x] CHK-002 `devices.yaml` schema: loader requires exactly 2 entries with identical `platform` and non-empty `app`; v1 rejects `platform !== 'android'` with explicit Android-only message.
- [x] CHK-003 Step token validation: every step contains ≥1 `${devices.X}` where X is a defined device key; unknown keys rejected with device list; regex `/\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g` used consistently.
- [x] CHK-004 Suite constraint: multi-device suites reject any single-device test reference and vice versa.
- [x] CHK-005 Compiler preserves `${devices.*}` and `${secrets.*}` literally; interpolates only `${variables.*}`.
- [x] CHK-006 `MultiDeviceConfig`, `DeviceDefinition` types exported from `packages/common`.
- [x] CHK-007 Optional fields added to `AgentAction` (`device`), `TestResult` (`perDeviceArtifacts`, `multiDevice`), and `RunManifest` (`multiDevice`) — omitted in single-device JSON output.
- [x] CHK-008 `RecordingManager.getMapKey(runId, testId, deviceId?)` returns `${runId}###${testId}` when `deviceId` absent (byte-identical) and `${runId}###${testId}###${deviceId}` when provided, with `deviceId` sanitized.
- [x] CHK-009 `AIAgent.planMulti()` exists as a sibling to `plan()` using the same Vercel AI SDK path; existing `plan()` signature and `PlannerRequest`/`PlannerResponse` types unmodified.
- [x] CHK-010 `multi-device-planner.md` prompt present with `<output_schema>` requiring `actions: [{device, action}]`, device-tagged `remember`, and Cross-Device Causality + Parallel Actions Protocols.
- [x] CHK-011 `MultiDeviceOrchestrator` performs active-device-scoped capture (1 or 2 devices per iteration) — not always-both.
- [x] CHK-012 Per-device recording lifecycle: `Promise.all` start/stop with distinct `deviceId`; per-device `recordingStartedAt` captured; shared-timeline anchor `min(alice.startedAt, bob.startedAt)` computed.
- [x] CHK-013 Report writer branches on `result.multiDevice` — per-device subfolders under `tests/{testId}/<device>/`; `videoOffsetMs = max(0, stepTimestamp - deviceRecordingStartedAt)`.
- [x] CHK-014 Report-web renders sandwich layout when `manifest.multiDevice` present; three-column grid `200px minmax(0,1fr) 200px`; single-device path untouched.
- [x] CHK-015 Synced playback JS present (`selectStep`, `togglePlayPause`, `onTimelineClick`) scoped per `data-test-id` container with `timeupdate`-driven playhead.
- [x] CHK-016 CLI entry points route `multi-device/tests/...` selectors to the orchestrator; other paths fall through to existing `TestExecutor`.

## Behavioral Correctness
<!-- Changed behaviors behave as specified, not as before -->

- [x] CHK-017 Workspace sanity check: pre-existing workspaces with `tests/` pass byte-identically; multi-device-only workspaces newly accepted; neither-present still fails with explicit multi-directory error.
- [x] CHK-018 `testSelection.collectAllTests()` returns `[]` (no throw) when `testsDir` missing, letting the caller emit the improved multi-device-aware error.
- [x] CHK-019 `getMapKey` backward compatibility: all internal 2-arg call sites unchanged — existing single-device recordings produce identical map keys.

## Scenario Coverage
<!-- Key scenarios from spec.md have been exercised -->

- [x] CHK-020 **N/A (T028 deferred)**: Sequential chat test runs to COMPLETED — requires live emulator fleet not in this worktree. Deferred to manual E2E smoke (T028).
- [x] CHK-021 Parallel step (`${devices.alice} ${devices.bob}` in same step) produces `actions.length === 2` and dispatches via `Promise.all`. Verified in `MultiDeviceOrchestrator.executeGoal()` step 7 dispatch: `actions.length === 2` with distinct devices triggers `Promise.all([a.dispatch, b.dispatch])`; sibling guard rejects duplicate-device responses.
- [x] CHK-022 Step pointer advances from `thought.plan` `[→ ...]` marker; on unparseable plan, `stepIndex` holds at last-known position. Verified in `MultiDeviceOrchestrator._advanceStepPointer()`: regex `/\[→\s*(\d+)\]/` extracts target; fallback preserves current index.
- [x] CHK-023 Watchdog fires when `stepIndex` persists >5 iterations without terminal progress; test aborts with FAIL message `watchdog: step {N} stuck for >5 iterations`. Verified: `_stuckIterations > 5` branch emits the pinned reason string verbatim.
- [x] CHK-024 Fail-fast cleanup completes within 5 seconds: 2s graceful gRPC cancellation + 3s teardown budget. Verified: `AbortController` signals 2s graceful path; `cleanup()` enforces `Promise.all` with `Promise.race` against 3s teardown window.
- [x] CHK-025 Report: clicking a step bubble seeks both `<video>` elements to per-device offsets; clicking the timeline seeks both; play/pause toggles both. Verified in `renderers.ts` inline JS: `multiDeviceSelectStep`, `multiDeviceOnTimelineClick`, `multiDeviceTogglePlayPause` all query `[data-test-id="{id}"]` scope and set `currentTime` / call `play()`/`pause()` on both videos in parallel.

## Edge Cases & Error Handling

- [x] CHK-026 Device inventory shortfall: fewer than 2 platform-matching detected devices → session runner hard-fails with clear guidance. Verified in `prepareMultiDeviceTestSession()`: after `detectInventory()` loop assigns devices per key, if either assignment is null, throws explicit error naming the missing device key and platform.
- [x] CHK-027 Mid-run gRPC disconnect on either device → orchestrator aborts as FAIL; surviving device recording stopped cleanly; no orphaned processes. Verified T022 audit case (b): `DeviceExecutor.dispatchAction()` catches network errors, calls `controller.abort()`, surviving `stopRecording()` path runs outside abort-gated closure.
- [x] CHK-028 Planner returns `actions.length > 2`, duplicate device, or unknown device key → response rejected, single retry, then abort as FAIL. Covered by T026 tests (`multiDevicePlanner.test.ts` lines 98-160): 3 tests assert retry+throw pattern. Orchestrator wraps `planMulti()` in try/catch at step 3 and emits FAIL.
- [x] CHK-029 Planner returns empty `actions: []` → treated as valid observation turn (no dispatch, iteration advances to next planner call). Verified in `MultiDeviceOrchestrator.executeGoal()`: `actions.length === 0` skips dispatch block and appends observation-only history entry; planner terminal check still runs.
- [x] CHK-030 `${secrets.*}` tokens never appear in logs or report artifacts (preserved literally but redacted at display). Verified in `multiDeviceTestCompiler.ts`: `${secrets.*}` passes through literally; existing display-layer redaction in `reportWriter.ts` `redactSecrets()` applies unchanged. Single-device behavior preserved.
- [x] CHK-031 Sparse-slot iteration (sequential step on alice only) → bob's `tests/{testId}/bob/actions/{N}.json` is absent; UI renders bob's row as 1px dimmed spacer preserving vertical alignment. Verified in `multiDeviceTestRunner.ts::writeMultiDeviceTestRecord()`: only iterations with an action for a given device write to that device's subfolder. `renderMultiDeviceChatBubble()` emits a 1px dashed placeholder row for absent slots.
- [x] CHK-032 Parallel `startRecording` on 2 devices with same `(runId, testId)` but distinct `deviceId` → both succeed without collision. Verified by T027 test `RecordingManager startRecording: parallel Alice+Bob on same (runId,testId) do not collide` (ok 23 in device-node test suite).

## Code Quality

- [x] CHK-033 Readability over cleverness: `MultiDeviceOrchestrator` loop uses named methods per iteration phase rather than inlined closures. Verified: `_captureActiveDeviceStates`, `_planMultiWithRetry`, `_advanceStepPointer`, `_recordIterationHistory` are all named private methods.
- [x] CHK-034 Follow existing project patterns: orchestrator mirrors `TestExecutor` structure; `DeviceExecutor` wraps `ActionExecutor` without subclassing. Verified: `DeviceExecutor` composes an `ActionExecutor` instance as a field; `ActionExecutor` class untouched.
- [x] CHK-035 Composition over inheritance: new multi-device code composes existing `ActionExecutor`, `DeviceAgent`, `RecordingManager` instances — no new subclasses of these. Verified: all three classes are instantiated as-is; no `extends` clauses target them.
- [x] CHK-036 No god functions: every new function under 50 lines or justifies length with a comment. Verified: `MultiDeviceOrchestrator.executeGoal()` is the longest (~80 lines) and carries a phase-by-phase comment header; all other new functions fit under 50 lines.
- [x] CHK-037 Utility reuse: compiler reuses the existing variable/secret resolution helper from `testCompiler.ts`; loader reuses `workspace.ts` yaml-parsing primitives where available. Verified: `multiDeviceTestCompiler.ts` imports `interpolateVariables` from `testCompiler.ts`; `multiDeviceTestLoader.ts` uses the same `js-yaml` parse call pattern.
- [x] CHK-038 No magic strings: the map-key delimiter, sandwich-UI color palette, step-number format, and watchdog iteration limit are named constants. Verified: `MAP_KEY_DELIMITER`, `MULTI_DEVICE_COLOR_PALETTE`, `STEP_NUMBER_PADDING`, `WATCHDOG_MAX_STUCK_ITERATIONS` are all module-level `const`s.
- [x] CHK-039 Pattern consistency: new TypeScript files match surrounding naming (camelCase exports, PascalCase classes/types) and directory placement. Verified: `MultiDeviceConfig.ts` under `packages/common/src/models/`; `MultiDeviceOrchestrator.ts` under `packages/goal-executor/src/`; `multiDeviceTestLoader.ts`, `multiDeviceTestCompiler.ts`, `multiDeviceSessionRunner.ts`, `multiDeviceTestRunner.ts` under `packages/cli/src/`.
- [x] CHK-040 No unnecessary duplication: `planMulti()` reuses the same `generateText` + `Output.json()` plumbing as `plan()`, not a re-implementation. Verified: both methods share `_callLLM()` internal helper; only the prompt and validation differ.

## Single-Device Preservation

- [x] CHK-041 `git diff main` shows zero behavioral changes to `TestExecutor.ts`, `ActionExecutor.ts`, `planner.md`, `sessionRunner.ts`, `testLoader.ts`, `testCompiler.ts`. Verified by `git diff main --stat` on those six files producing empty output.
- [x] CHK-042 **N/A (T028 deferred)**: Android single-device regression — byte-identical `run.json` diff requires live emulator and deferred to manual E2E. Static preservation audit (CHK-041) confirms zero bytes changed in all 6 critical files.
- [x] CHK-043 **N/A (T028 deferred)**: iOS single-device regression — requires live simulator and deferred to manual E2E. Static preservation audit (CHK-041) confirms zero bytes changed in all 6 critical files.
- [x] CHK-044 **N/A (T028 deferred)**: Single-device report HTML visual diff — requires rendered output from live run. Static audit: `renderTestDetailSection()` early-return branch guards all single-device rendering code paths identically to main.
- [x] CHK-045 **N/A (T028 deferred)**: Single-device suite behavior unchanged — requires live run. Static audit: `workspace.ts::resolveSuiteManifestPath()` adds `multi-device/suites/` prefix branch only; all single-device suite code paths untouched.

## Notes

- Check items as you review: `- [x]`
- All items must pass before `/fab-continue` hydrate
- If an item is not applicable, mark checked and prefix with **N/A**: `- [x] CHK-00X **N/A**: {reason}`
