# Intake: Multi-Device Test Orchestration (v1)

**Change**: 260415-1mzp-multi-device-orchestration
**Created**: 2026-04-15
**Status**: Draft

## Origin

User provided a finalized, pre-discussed plan at `/Users/ashishyadav/.claude/plans/harmonic-puzzling-robin.md` titled *"Multi-Device Test Orchestration (v1: 2 Devices, Same Platform)"* and invoked `/fab-new` with the instruction *"Use the plan here at: '/Users/ashishyadav/.claude/plans/harmonic-puzzling-robin.md'"*.

The plan itself is the product of an extensive `/fab-discuss` iteration preceding this intake, during which the user:

- Reviewed the original open-questions analysis of `stateful-meandering-beacon.md`, answered all 20 outstanding questions, and locked scope to exactly 2 devices / same platform / auto-assign / fail-fast.
- Pointed to the UI mock at `/Users/ashishyadav/Downloads/multi_device_sandwich_layout.html` as the canonical report-web design reference (phone | chat-bubble timeline | phone sandwich with color-coded devices).
- Pushed back on an "always capture both devices" draft, insisting the orchestrator capture ONLY the step-active devices each turn (mirrors single-device `planner.md` semantics).
- Explicitly required that single-device flows (both Android AND iOS) remain byte-identical — *"nothing should break the single device runs"*.
- Corrected an oversight where `ensureWorkspaceDirectories()` would block multi-device-only workspaces — requiring the sanity check to accept `tests/` OR `multi-device/tests/`.

All 9 cross-cutting design decisions are resolved in the plan (see Assumptions table). The plan is additive and feature-gated throughout; no existing single-device file is semantically modified.

> Use the plan here at: '/Users/ashishyadav/.claude/plans/harmonic-puzzling-robin.md'

## Why

FinalRun runs AI-driven mobile tests on a single device today. The full stack — `TestExecutor` loop, `AIAgent.plan()`, `ActionExecutor`, `ReportWriter`, `RecordingManager`, and the report-web UI — assumes one device, one screenshot stream, one video.

**The problem:** Modern mobile test needs (chat send/receive, parallel login on two accounts, shared docs, cross-device read receipts) are fundamentally multi-actor. Splitting them into two single-device runs loses the crucial cross-device causality — *"action on A produces effect on B"* — that the AI planner must reason about to validate the feature. Today, users who want to verify a chat flow either have to fake it with mocks, or manually correlate two independent test runs after the fact, which defeats the purpose of end-to-end validation.

**The consequence of not fixing it:** FinalRun cannot credibly claim to automate modern mobile app test suites. Every customer with a messaging, collaboration, or multi-tenant workflow (a significant portion of the addressable market) hits a wall on day one. Worse, existing users attempting these flows today get misleading single-device runs that appear to pass when the actual cross-device behavior is broken in production.

**Why this approach over alternatives:**

- *Two independent test runs with post-hoc correlation* was rejected because the planner cannot reason about causality without unified state.
- *Single orchestrator with always-parallel capture* was rejected because it doubles token cost on sequential steps and doesn't match `planner.md`'s mental model.
- *Tool-calling planner with on-demand device refresh* was deferred because the active-device-scoping approach already minimizes cost without the complexity.
- *Mutating `PlannerResponse` to carry a `device` field* was rejected because it would risk every single-device call site (~15 in `TestExecutor`). Sibling types preserve single-device byte-identically.

The chosen design — active-device-scoped orchestrator with sibling planner types and feature-gated UI — delivers true cross-device causality while making zero semantic changes to the single-device path.

## What Changes

### Scope (hard-validated at loader time)

- **Exactly 2 devices.** Not 1, not 3+.
- **Same platform** (v1: both Android — iOS rejected until iOS recording lands).
- **Auto-assigned hardware** from detected inventory. No interactive prompts, CI-compatible.
- **Fail-fast** on any device failure, gRPC disconnect, or expected-state divergence.
- **Multi-device suites reference multi-device tests only** — no mixed-mode.
- **Zero disruption to single-device** (both Android and iOS remain byte-identical).

### New workspace shape

```
.finalrun/
├── tests/                       # existing single-device — UNTOUCHED
├── suites/                      # existing single-device — UNTOUCHED
├── multi-device/                # NEW
│   ├── devices.yaml
│   ├── tests/**/*.yaml
│   └── suites/*.yaml
├── env/                         # UNTOUCHED
└── config.yaml                  # UNTOUCHED
```

`devices.yaml`:

```yaml
devices:
  alice:
    platform: android
    app: com.example.app1
  bob:
    platform: android
    app: com.example.app2
```

Workspace sanity check (`ensureWorkspaceDirectories`) now requires at least ONE of `tests/` OR `multi-device/tests/`. Workspaces with `tests/` pass byte-identically; multi-device-only workspaces are newly accepted.

### New CLI routing

- `finalrun test auth/login.yaml` → existing `TestExecutor` path (unchanged).
- `finalrun test multi-device/tests/chat/send_message.yaml` → new `MultiDeviceOrchestrator`.
- `finalrun test` (no args) with `tests/` present → unchanged; with multi-device-only workspace → clear error suggesting `multi-device/tests/`.

### Active-device-scoped orchestrator loop

Each iteration:

1. Identify current step via `stepIndex → YAML step text`.
2. Regex-extract `${devices.X}` tokens from that step → `activeDevices` (1 or 2).
3. Capture screenshot + hierarchy from `activeDevices` ONLY (`Promise.all` if 2).
4. Call `aiAgent.planMulti({ testObjective, history, remember, activeDeviceStates, devices })`.
5. Planner returns `{ actions: Array<{device, action}>, remember?, thought? }`.
6. Terminal check: `COMPLETED` or `FAILED` → end test.
7. Dispatch actions (`Promise.all` if 2 distinct devices, sequential if 1).
8. Capture post-action state → update `lastKnownState[device]`.
9. Append device-tagged entries to `history`.

Step pointer advances from `thought.plan` `[→ in-progress]` marker (same format already emitted by `planner.md`). Fallback: hold pointer on unparseable plan; watchdog aborts on stuck step.

### Sibling planner types and prompt

- New `MultiDevicePlannerRequest`, `MultiDevicePlannerResponse`, and shared `PlannerAction` structural type in `AIAgent.ts` (additive).
- New `AIAgent.planMulti()` method using the same Vercel AI SDK `generateText` + `Output.json()` path as `plan()`. Message built programmatically to support 1-or-2 active-device blocks.
- New `packages/goal-executor/src/prompts/multi-device-planner.md` mirroring `planner.md`'s structure: `<turn_loop>`, `<output_schema>` with `actions[]`, `<actions>` catalog copied, `<stagnation_and_retries>` scoped to `{device}:{element}`.
- Existing `plan()`, `PlannerResponse`, and `planner.md` UNTOUCHED.

### Non-breaking RecordingManager fix

`getMapKey(runId, testId, deviceId?)` — `deviceId` is optional. Omitted → returns `${runId}###${testId}` (byte-identical to today). Provided → returns `${runId}###${testId}###${deviceId}`. All existing single-device call sites omit the 3rd arg and keep the 2-arg key format. Resolves the dual-recording collision for multi-device.

### Per-device artifacts

- `AgentAction.device?: string` — omitted in single-device runs, always set in multi-device.
- `TestResult.perDeviceArtifacts?: Record<string, {folder, recordingFile?, deviceLogFile?, recordingStartedAt?}>` — absent in single-device.
- `RunManifest.multiDevice?: {devices: Record<string, {platform, app?, hardwareName}>}` — absent in single-device.
- Report writer branches on `result.multiDevice` presence: multi-device creates `tests/{testId}/<device>/{screenshots,actions}/` subfolders, scoped per-device.
- Step numbering: `stepNumber = iteration` (shared, 1-indexed, zero-padded). Sparse slots permitted (sequential step only fills one device's folder).

### Sandwich UI (report-web)

Per mock at `/Users/ashishyadav/Downloads/multi_device_sandwich_layout.html`:

- Outer container, 3-column grid `200px minmax(0,1fr) 200px`:
  - Left column: alice phone header (dot `#7F77DD`, platform label, device name) + `<video>` at `aspect-ratio: 9/19`.
  - Center column: chat-bubble step timeline (alice steps left-aligned purple `#EEEDFE`/border `#7F77DD`, bob steps right-aligned green `#E1F5EE`/border `#1D9E75`, parallel steps full-width dashed).
  - Right column: bob phone (mirror of alice, header reversed).
- Shared timeline scrubber below with per-device colored segments, linear-gradient for parallel steps, click-seek on both videos.
- Synced playback JS: clicking a bubble seeks both videos to per-device `videoOffsetMs`; play/pause synced; timeline click seeks both.
- `renderTestDetailSection()` branches on `manifest.multiDevice` at first line — single-device never enters new renderers.

### Per-device video sync math

`videoOffsetMs = max(0, stepTimestamp - deviceRecordingStartedAt)`. Shared scrubber t=0 anchors at `min(alice.startedAt, bob.startedAt)`. Handles the 100-500ms gap between parallel `startRecording` calls.

### Fail-fast semantics

- Action dispatch failure on either device → FAIL; surviving device's in-flight action interrupted via `AbortController`; both recordings stopped cleanly.
- gRPC disconnect → FAIL.
- Planner emits duplicate-device actions → reject response, retry `planMulti()` once, then FAIL.
- Either device emits `PLANNER_ACTION_FAILED` → FAIL.

### Phased delivery

1. **Phase 1** — Loader, compiler, config models (no execution flow).
2. **Phase 2** — `planMulti()` + `multi-device-planner.md`.
3. **Phase 3** — `MultiDeviceOrchestrator` + parallel recording + RecordingManager fix.
4. **Phase 4** — Report model + ReportWriter per-device artifacts.
5. **Phase 5** — report-web sandwich UI.

Each phase is independently testable and leaves single-device paths byte-identical.

## Affected Memory

- `cli/multi-device-workspace`: (new) workspace layout rules — `multi-device/` subtree, `devices.yaml` shape, `ensureWorkspaceDirectories` accepting `tests/` OR `multi-device/tests/`.
- `cli/multi-device-orchestration`: (new) CLI → orchestrator routing, auto-assign logic, session lifecycle, fail-fast semantics.
- `cli/report-writer`: (modify) add per-device artifact branch, step-numbering sparse-slot rule.
- `goal-executor/multi-device-planner`: (new) `planMulti()` flow, active-device-scoping mental model, `PlannerAction` structural type, sibling-types convention.
- `device-node/recording-manager`: (new) non-breaking `getMapKey` 3rd-arg convention, dual-recording collision rationale.
- `common/multi-device-models`: (new) `MultiDeviceConfig`, `AgentAction.device?`, `TestResult.perDeviceArtifacts?`, `RunManifest.multiDevice?`.
- `report-web/renderers`: (modify) sandwich-layout renderers, synced playback JS, `manifest.multiDevice` gating convention.

## Impact

- **Packages:** `common` (new models), `cli` (new loader/compiler/session-runner + gated branches in workspace/testSelection/testRunner/reportWriter/finalrun.ts), `goal-executor` (new orchestrator + planner prompt + `planMulti()` on `AIAgent`), `device-node` (non-breaking `getMapKey` 3rd arg), `report-web` (gated renderers + artifacts branch + synced playback JS).
- **Untouched:** `TestExecutor.ts`, `ActionExecutor.ts` (class body), `planner.md`, `sessionRunner.ts`, `testLoader.ts`, `testCompiler.ts`, `Device`, `DeviceNode`, `DevicePool`, `GrpcDriverClient`, existing `tests/` and `suites/` directories.
- **External systems:** none. No API schema changes, no CI changes, no database changes. Reports remain self-contained HTML/JSON; `run.json` gains an optional field.
- **Regression surface (must verify before ship):** (1) single-device Android `auth/login.yaml` artifact tree + `run.json` byte-identical to baseline; (2) single-device iOS equivalent; (3) single-device suite `smoke.yaml` batch behavior; (4) single-device report HTML visual diff = 0.

## Open Questions

- **gRPC independence** — `DeviceNode.getInstance()` is a singleton. Phase 3 opens with a half-day spike to confirm `setUpDevice()` returns two independent `GrpcDriverClient` instances with no cross-talk when driven in parallel. Risk B in the plan. If the singleton leaks state, Phase 3 has to refactor `DeviceNode` before proceeding.
- **`AbortController` threading** — Single-device `ActionExecutor` is untouched (per constraint), so the `AbortController` must be threaded through a new multi-device `DeviceExecutor.dispatchAction()` wrapper rather than modifying the existing class. Exact interruption semantics (graceful vs. hard-kill mid-gRPC) TBD in Phase 3 design.
- **Step-pointer ambiguity** — If `thought.plan` is missing or ambiguous, orchestrator holds the pointer. Exact watchdog threshold ("stuck step runs > N iterations") needs a number — tentatively 5, mirroring the single-device planner's Case-E stagnation threshold.
<!-- Resolved 2026-04-15 — see Assumption #19: inactive device's row reserves visual space as a 1px dimmed spacer. -->
- **AbortController gRPC cancellation semantics** — graceful cancel via `AbortController.abort()` triggers gRPC call-stream cancellation in the multi-device `DeviceExecutor.dispatchAction()` path. Hard teardown is a fallback on cancellation timeout. Exact timeout budget (recommend 2s) to be pinned in Phase 3 design review.

## Clarifications

### Session 2026-04-15 (bulk confirm)

| # | Action | Detail |
|---|--------|--------|
| 16 | Confirmed | — |
| 17 | Confirmed | — |
| 18 | Confirmed | — |

### Session 2026-04-15 (taxonomy scan)

| # | Question | Answer |
|---|----------|--------|
| 19 | Sparse-slot UI: reserve space vs collapse vs explicit "(idle)"? | Reserve space as 1px dimmed spacer (recommended option accepted). |

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Exactly 2 devices per multi-device test, hard-validated at loader time. Not 1, not 3+. | User explicitly confirmed during /fab-discuss: *"We JUST support 2 devices only"*. Matches v1 use cases (chat send/receive, parallel login). 3+ rejected as scope creep. | S:95 R:95 A:90 D:90 |
| 2 | Certain | v1 requires both devices on the SAME platform, and that platform MUST be Android. iOS rejected with clear loader error. | User answered: *"Same platform only"*. iOS recording stack isn't supported today (device-node iOS recording provider exists but is incomplete per risk assessment); enforcing Android-only avoids shipping a broken iOS path. Clear unlock path when iOS recording lands. | S:95 R:95 A:85 D:85 |
| 3 | Certain | Hardware auto-assigned from `DeviceNode.detectInventory()`. For each `devices.yaml` key, pick the first detected device matching that platform and not already assigned. No interactive prompts. | User answered: *"Assume that we will auto assign"*. CI compatibility is a hard requirement (no human-in-loop). Deterministic ordering needed for reproducibility — will use detection order. | S:90 R:90 A:90 D:85 |
| 4 | Certain | Fail-fast on ANY of: device failure, gRPC disconnect, expected-state divergence, planner emits duplicate-device actions twice. Surviving device's in-flight action interrupted via `AbortController`; both recordings closed cleanly; test marked FAIL. | User answered: *"fail-fast"*. Matches the single-device fail model (a failed step fails the test). Alternative (best-effort continuation) rejected — partial results would mislead the report. | S:95 R:90 A:90 D:85 |
| 5 | Certain | Active-device-scoped capture. Each iteration parses the current step's `${devices.X}` tokens → `activeDevices`; captures screenshot+hierarchy from those devices only. Passive devices not captured, not sent to planner that turn. | User explicitly pushed back on always-both: *"we are always capturing both the device, why? our multi-device-planner system prompt needs to process each line from the yaml file and then accordingly act"*. Mirrors `planner.md` mental model, minimizes token cost for sequential steps. | S:95 R:95 A:95 D:90 |
| 6 | Certain | Single-device paths remain byte-identical (both Android and iOS). All multi-device changes are additive and feature-gated at branch points (`manifest.multiDevice`, `result.multiDevice`, `multi-device/tests/` path prefix, optional `getMapKey` 3rd arg). Regression test matrix required before ship. | User requirement: *"nothing should break the single device runs i.e. current one for Android / iOS. Keep this thing separate"*. Plan explicitly audits every touch point in the Single-Device Preservation Guarantee table. | S:95 R:95 A:95 D:95 |
| 7 | Certain | Sibling planner types. `PlannerResponse` and `planner.md` are NOT modified. New `MultiDevicePlannerRequest`, `MultiDevicePlannerResponse`, `PlannerAction` (structural type), and `AIAgent.planMulti()` method are added. Shared `PlannerAction` fields overlap structurally with `PlannerResponse` but don't mutate it. | Prevents risk to ~15 existing `plan()` call sites in `TestExecutor`. Alternative (union-typed response) would have forced every caller to narrow the type, contradicting assumption #6. | S:95 R:95 A:90 D:90 |
| 8 | Certain | `RecordingManager.getMapKey(runId, testId, deviceId?)` — optional 3rd arg. Omitted → byte-identical 2-part key (all existing single-device call sites). Provided → 3-part key including device. Resolves dual-recording collision for multi-device without touching single-device keys. | User requirement #6 forces non-breaking. Plan agent flagged a breaking signature change; user-approved fix is optional-param convention. Internal calls default to `undefined` for existing callers. | S:95 R:90 A:85 D:90 |
| 9 | Certain | Sandwich UI layout per mock at `/Users/ashishyadav/Downloads/multi_device_sandwich_layout.html`. Three columns `200px minmax(0,1fr) 200px`, chat bubbles centre (alice left purple `#7F77DD`/`#EEEDFE`, bob right green `#1D9E75`/`#E1F5EE`, parallel full-width dashed), shared scrubber below with color-coded segments and synced play/pause/seek. | User directive: *"For all the UI decisions can you just follow '/Users/ashishyadav/Downloads/multi_device_sandwich_layout.html'"*. Mock shown directly; plan extracted exact colors, grid, and interaction model from it. | S:95 R:90 A:90 D:80 |
| 10 | Certain | Per-device video sync. Each device's recording stamps `recordingStartedAt`; per-step `videoOffsetMs = max(0, stepTimestamp - deviceRecordingStartedAt)`. Shared scrubber anchors t=0 at `min(alice.startedAt, bob.startedAt)`. Click-step seeks both `<video>` elements to their own offsets. | Parallel `startRecording` calls have a 100-500ms gap in practice. Anchoring the scrubber at the earlier start and offsetting each video independently is the only way to keep the timeline coherent. | S:90 R:90 A:80 D:85 |
| 11 | Certain | Per-device stagnation scoping. Element identity is `{device}:{element}` (`alice:LoginButton` ≠ `bob:LoginButton`). Test-level stagnation fires only when BOTH devices are stagnant simultaneously. Prompt guidance: observer-device patience is normal. | Chat tests naturally have one device waiting while the other acts. Without scoping, single-device Case-E stagnation would fire spuriously on observer devices. | S:90 R:90 A:85 D:85 |
| 12 | Certain | No tool-calling planner for v1. Single `planMulti()` call per iteration returns `actions[]`. No mid-turn state-refresh tools. | Active-device-scoping (#5) already minimizes token cost. Tool-use adds complexity (multi-step agent loop, tool result formatting) that isn't proven necessary. Defer to v2 if evidence emerges. | S:95 R:90 A:90 D:80 |
| 13 | Certain | `ensureWorkspaceDirectories()` requires at least ONE of `tests/` OR `multi-device/tests/`. Workspaces with both work; workspaces with only `tests/` (existing shape) pass byte-identically; workspaces with only `multi-device/tests/` (new shape) are newly accepted; workspaces with neither fail with a clear error naming both dirs. | User correction during /fab-discuss: *"finalrun test currently verifies if tests exist, now either tests or multi-device need to exist"*. Closes the multi-device-only-workspace case. | S:95 R:95 A:90 D:90 |
| 14 | Certain | `${devices.X}` tokens may appear ANYWHERE in a step string (not only as a leading token). Loader regex-extracts the unique device set per step: `/\$\{(variables\|secrets\|devices)\.([A-Za-z0-9_-]+)\}/g`. ≥1 device ref required per step; 2 distinct = parallel-capable. | Allows natural step authoring like `"When ${devices.alice} shows X, ${devices.bob} responds"`. Uniform regex also reuses the existing token-extraction pattern from `testCompiler.ts`. | S:90 R:85 A:80 D:85 |
| 15 | Certain | Step pointer advances from `thought.plan` field's `[→ in-progress]` marker (same format already emitted by `planner.md` line 62). On first iteration, `stepIndex = 1`. | Reuses existing planner output convention — no new schema. Orchestrator's parser requires exact marker match to minimize drift risk. | S:90 R:85 A:80 D:80 |
| 16 | Certain | Step-pointer fallback: if `thought.plan` is missing or unparseable, hold `stepIndex` at last-known position. Watchdog aborts the test if the same step runs > 5 iterations without progress (matching single-device Case-E threshold). | Clarified — user confirmed. | S:95 R:75 A:70 D:70 |
| 17 | Certain | `AbortController` threading for mid-action interruption on surviving device when sibling fails. Threaded through new `DeviceExecutor.dispatchAction()` wrapper (single-device `ActionExecutor` untouched per #6). | Clarified — user confirmed. | S:95 R:85 A:75 D:70 |
| 18 | Certain | Multi-device suites reference multi-device tests only. No mixed-mode suites. | Clarified — user confirmed. | S:95 R:80 A:75 D:75 |
| 19 | Certain | Sparse-slot UI rendering: when only one device acts in iteration N, the inactive device's row reserves visual space as a 1px dimmed spacer — preserving vertical alignment with the shared scrubber and keeping parallel-vs-sequential visually distinct without noise. Parallel steps fill both columns. | Clarified — user confirmed recommended option. Maintains timeline row ↔ scrubber segment correspondence (the defining feature of the sandwich UI) while mirroring the mock's implied empty-slot treatment. Rejected alternatives: collapsed row (breaks alignment) and explicit "(idle)" bubble (noisy for chat flows that are 70% idle turns). | S:95 R:80 A:90 D:75 |

19 assumptions (19 certain, 0 confident, 0 tentative, 0 unresolved).
