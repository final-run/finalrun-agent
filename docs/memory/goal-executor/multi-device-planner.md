# Multi-Device Planner & Orchestrator (goal-executor)

`AIAgent.planMulti()` and `MultiDeviceOrchestrator` run the 2-device iteration loop. Both are **siblings** to the existing single-device `plan()` and `TestExecutor` — the single-device code paths are never modified. Introduced by change `260415-1mzp-multi-device-orchestration`.

## Sibling Planner: `AIAgent.planMulti()`

`planMulti(request: MultiDevicePlannerRequest): Promise<MultiDevicePlannerResponse>` in `packages/goal-executor/src/ai/AIAgent.ts`:

- Uses the same Vercel AI SDK `generateText` + `Output.json()` pipeline as `plan()`.
- Loads prompt `multi-device-planner.md` (not `planner.md`).
- Builds the user message programmatically so per-active-device blocks (1 or 2) can be injected as separate parts.
- Retries once on LLM or parse failure; throws after the second failure (the orchestrator records this as a FAIL reason).

Sibling types (do NOT mutate `PlannerRequest` / `PlannerResponse`):

```
interface MultiDeviceActiveState {
  preActionScreenshot?: string;
  postActionScreenshot: string;
  hierarchy: Hierarchy;
  platform: string;
}
interface MultiDevicePlannerRequest {
  testObjective: string;
  devices: string[];                                    // all configured keys — for validation
  activeDeviceStates: Record<string, MultiDeviceActiveState>;  // 1 or 2 keys, subset of `devices`
  history?: string;
  remember?: Array<{ device: string; note: string }>;
  preContext?: string;
  traceStep?: number;
}
interface MultiDevicePlannerResponse {
  actions: Array<{ device: string; action: PlannerAction }>;   // 0, 1, or 2 entries
  remember: Array<{ device: string; note: string }>;
  thought?: { plan?: string; think?: string; act?: string };
  trace?: LLMTrace;
}
interface PlannerAction {                               // action-shape subset shared by siblings
  act: string; reason: string; text?: string; clearText?: boolean;
  direction?: string; durationSeconds?: number; url?: string;
  repeat?: number; delayBetweenTapMs?: number; result?: string;
  analysis?: string; severity?: string;
}
```

Response validation (all failures retry once, then throw):

- Reject `actions.length > 2`.
- Reject unknown `device` keys (not in the `devices` manifest).
- Reject duplicate device entries in `actions` (one action per device per iteration).

## Prompt: `multi-device-planner.md`

`packages/goal-executor/src/prompts/multi-device-planner.md` is a sibling to `planner.md`. Key differences:

- Describes a 2-device manifest and the active-device set per turn.
- Output schema uses `actions: [...]` (array) instead of a single action; `remember` entries are device-tagged.
- Parallel-actions rule: 2 actions are allowed iff the current step references both devices AND the actions are independent.
- Cross-device causality protocol: when alice's step produces an effect on bob, bob's first fresh capture the next iteration observes that effect.
- Stagnation element identity is `{device}:{element}`; test-level stagnation fires only when both devices stagnate in the same turn.

The existing `planner.md` is NEVER modified (byte-identical preservation).

## Orchestrator Iteration Loop

`packages/goal-executor/src/MultiDeviceOrchestrator.ts` runs one `executeGoal()` per test. Per iteration:

1. **Active-device scoping** — parse `${devices.X}` tokens from `steps[stepIndex - 1]` to compute `activeDeviceKeys` (1 or 2). Passive devices are NOT captured and NOT included in the planner prompt.
2. **Parallel capture** — `Promise.all` screenshot + hierarchy from active devices.
3. **`planMulti()` call** — pass only active-device states, full device manifest for validation.
4. **Terminal check** — any action with `act === COMPLETED || FAILED` ends the loop.
5. **Dispatch** — `actions.length === 1` → single `executeAction()`. `actions.length === 2` with distinct device keys → `Promise.all`. Empty → observation-only turn.
6. **Step pointer advance** — parse `thought.plan` for `[→ ...]` marker; fall back to holding stepIndex.
7. **Watchdog** — if `stepIndex` repeats for >5 consecutive iterations without terminal progress, abort FAIL with reason `watchdog: step {N} stuck for >5 iterations`.

`ActionExecutor` is composed (one instance per device) and **never modified** — preservation constraint.

## Step Pointer Parsing

Planner emits natural-language markers in `thought.plan`:

- `[✓ alice login]` — completed step.
- `[→ bob observes message]` — in-progress step; ordinal = (count of preceding `[✓ …]`) + 1.
- `[○ alice replies]` — upcoming step.

Canonical form is natural-language; digit form (`[→ 3]` or `[→ step 3]`) is accepted as backward-compat fallback via `PLAN_ADVANCE_DIGIT_PATTERN`. When no `[→ …]` marker is found OR the plan is empty, `stepIndex` holds at its last-known value (the watchdog will catch runaway).

Regexes:

```
MULTI_DEVICE_TOKEN_PATTERN   = /\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g
PLAN_COMPLETED_MARKER_PATTERN = /\[✓[^\]]*\]/g
PLAN_ADVANCE_DIGIT_PATTERN   = /\[→\s*(?:step\s+)?(\d+)\s*\]/i
PLAN_ADVANCE_MARKER_PATTERN  = /\[→[^\]]*\]/
```

## Fail-Fast Semantics

Any of the following aborts the test with FAIL:

- Action dispatch failure on either device (gRPC error, timeout, exception).
- Mid-run gRPC disconnect on either device.
- `PLANNER_ACTION_FAILED` action returned by the planner.
- Duplicate-device response after retry.
- Unknown device key in planner actions after retry.
- Watchdog threshold (5 consecutive iterations on same stepIndex).
- Capture failure on either active device.

On fail-fast, the orchestrator:

1. Calls `AbortController.abort()` — any in-flight action honoring the signal interrupts.
2. Waits up to `GRACEFUL_ABORT_BUDGET_MS = 2000ms` for in-flight dispatch to settle.
3. Stops both recordings via `Promise.all`.
4. Lets the session runner's `cleanup()` tear down both devices (3s budget = remaining piece of the 5s ceiling).

Total cleanup budget = 5 seconds (2s graceful + 3s teardown). The `AbortController` does **not** cancel the underlying gRPC call — `ActionExecutor` is untouched and does not accept an `AbortSignal`. The orchestrator simply stops waiting and proceeds to teardown.

## Recording Metadata (shared scrubber anchor)

`_buildRecordingMetadata()` returns `{ anchorStartedAt, devices }` after both recordings have started. `anchorStartedAt = ISO(min(all device startedAt timestamps))`. Per-device entries carry their own `startedAt`, `filePath`, and `completedAt`. Per-step `videoOffsetMs` is computed downstream by the report writer as `max(0, stepTimestamp - deviceRecordingStartedAt)`.

## Design Decisions (from change 260415-1mzp)

- **Sibling planner types and method** — alternative rejected: mutate `PlannerResponse`. Adding an optional `device` to `PlannerResponse` would force ~15 single-device call sites to narrow the type. Sibling `MultiDevicePlannerRequest/Response` + `PlannerAction` confines regression surface to the new path.
- **Active-device-scoped capture** — alternative rejected: always-both capture. Token cost scales with step device count, not pool size; observer device's unchanged state adds noise to reasoning.
- **Natural-language step markers with digit fallback** — alternative rejected: externally-tracked step counter. Reuses the planner's existing `[✓]/[→]/[○]` convention; no schema changes; digit form is backward-compat.
- **Fail-fast over best-effort** — alternative rejected: continue with one device on failure. Multi-device tests presume 2-device coordination; partial results are misleading.
- **`ActionExecutor` untouched** — the `AbortController` race lives in the orchestrator wrapper, not the action executor itself. This is the core preservation invariant.
- **No tool-calling planner for v1** — one `planMulti()` call per iteration. Mid-turn state-refresh tools deferred to v2.
