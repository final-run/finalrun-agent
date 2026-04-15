# Spec: Multi-Device Test Orchestration (v1)

**Change**: 260415-1mzp-multi-device-orchestration
**Created**: 2026-04-15
**Affected memory**: `docs/memory/cli/multi-device-workspace.md`, `docs/memory/cli/multi-device-orchestration.md`, `docs/memory/cli/report-writer.md`, `docs/memory/goal-executor/multi-device-planner.md`, `docs/memory/device-node/recording-manager.md`, `docs/memory/common/multi-device-models.md`, `docs/memory/report-web/renderers.md`

## Non-Goals

- Three-or-more-device tests — the v1 loader MUST reject `devices.yaml` files with `!= 2` device entries.
- Cross-platform multi-device tests — both devices MUST share the same `platform` value.
- iOS multi-device — v1 requires `platform: android` for both devices; `platform: ios` is rejected at load time with a message pointing at the v1 constraint.
- Interactive device selection — hardware is auto-assigned from `DeviceNode.detectInventory()`; no prompts.
- Mixed-mode suites — a suite manifest under `multi-device/suites/` MAY reference multi-device tests only; a suite under `suites/` MAY reference single-device tests only.
- Tool-calling planner for v1 — `planMulti()` is a single-shot call per iteration; no mid-turn state-refresh tools.
- Environment-variable overrides for `devices.yaml`.
- Retroactive backfill of per-device fields onto previously-recorded single-device runs.

## CLI: Workspace & Loader

### Requirement: Workspace layout accepts multi-device subtree

The workspace root SHALL recognize a `multi-device/` subtree at `.finalrun/multi-device/` with the following structure:

- `.finalrun/multi-device/devices.yaml` — required when multi-device tests exist.
- `.finalrun/multi-device/tests/**/*.yaml` — multi-device test YAMLs.
- `.finalrun/multi-device/suites/*.yaml` — multi-device suite YAMLs (optional).

The existing `.finalrun/tests/`, `.finalrun/suites/`, `.finalrun/env/`, and `.finalrun/config.yaml` paths MUST remain unchanged and MUST continue to drive single-device behavior byte-identically.

#### Scenario: Multi-device-only workspace is valid

- **GIVEN** a workspace with `.finalrun/multi-device/tests/` present and `.finalrun/tests/` absent
- **WHEN** `finalrun test multi-device/tests/chat/send_message.yaml` runs
- **THEN** the command succeeds
- **AND** `finalrun test` (no args) fails with the message `No .finalrun/tests directory. Use "finalrun test multi-device/tests/" to run multi-device tests.`

#### Scenario: Single-device-only workspace is unchanged

- **GIVEN** a workspace with `.finalrun/tests/` present and `.finalrun/multi-device/` absent
- **WHEN** the workspace sanity check runs
- **THEN** it passes with byte-identical behavior to today
- **AND** `finalrun test auth/login.yaml` routes to the existing `TestExecutor` path

#### Scenario: Dual-mode workspace supports both

- **GIVEN** a workspace with both `.finalrun/tests/` and `.finalrun/multi-device/tests/` present
- **WHEN** the user runs `finalrun test auth/login.yaml` and `finalrun test multi-device/tests/chat.yaml` in sequence
- **THEN** the first is routed to the single-device executor and the second to the multi-device orchestrator
- **AND** both succeed independently

#### Scenario: Empty workspace fails with clear error

- **GIVEN** a workspace with neither `.finalrun/tests/` nor `.finalrun/multi-device/tests/`
- **WHEN** the workspace sanity check runs
- **THEN** it fails with a message naming both expected directories

### Requirement: devices.yaml validation

The multi-device loader SHALL validate `devices.yaml` before any test is loaded. Validation MUST enforce:

- Exactly 2 device entries (keys under `devices:`). Not 1. Not 3+.
- Both entries SHALL carry a `platform` field with identical values.
- The shared platform SHALL be `android` for v1. Any other value MUST be rejected with a message pointing to the v1 Android-only constraint.
- Both entries SHALL carry a non-empty `app` field.
- Keys SHALL be non-empty strings that do not contain the reserved map-key delimiter (`###`).

Validation failures MUST produce actionable errors that name the offending field.

#### Scenario: Non-2-device config rejected

- **GIVEN** a `devices.yaml` with 3 entries
- **WHEN** the loader runs
- **THEN** loading fails with an error stating "multi-device v1 requires exactly 2 devices"

#### Scenario: Empty or single-device config rejected

- **GIVEN** a `devices.yaml` with 0 or 1 entries under `devices:`
- **WHEN** the loader runs
- **THEN** loading fails with the same "multi-device v1 requires exactly 2 devices" error, naming the actual count
<!-- clarified: 2026-04-15 — explicit edge case for the symmetric lower-bound side of "exactly 2"; derived from assumption #1. -->


#### Scenario: Cross-platform config rejected

- **GIVEN** a `devices.yaml` with `alice.platform: android` and `bob.platform: ios`
- **WHEN** the loader runs
- **THEN** loading fails with an error stating that both devices must share the same platform

#### Scenario: iOS config rejected in v1

- **GIVEN** a `devices.yaml` with both devices set to `platform: ios`
- **WHEN** the loader runs
- **THEN** loading fails with an error naming the Android-only v1 constraint

### Requirement: Test step device-token validation

Each step string in a multi-device test YAML SHALL contain at least one `${devices.<key>}` token. The referenced key MUST exist in `devices.yaml`. A step with two distinct device tokens is parallel-capable; a step with one device token is sequential.

The loader regex SHALL match tokens anywhere in the step string: `/\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g`.

#### Scenario: Step without device token rejected

- **GIVEN** a multi-device test where one step is `"tap Send"`
- **WHEN** the loader validates the test
- **THEN** loading fails with an error identifying the step and requesting a `${devices.*}` reference

#### Scenario: Step references unknown device rejected

- **GIVEN** `devices.yaml` with keys `alice` and `bob` and a step `"${devices.charlie} tap Login"`
- **WHEN** the loader validates the test
- **THEN** loading fails with an error naming `charlie` as an unknown device key

#### Scenario: Mixed tokens accepted

- **GIVEN** a step `"when ${devices.alice} shows \"Logged in\" then ${devices.bob} should tap Accept"`
- **WHEN** the loader parses it
- **THEN** the unique active-device set is `{alice, bob}` and the step is classified parallel-capable

### Requirement: CLI path resolution for multi-device selectors

Selectors beginning with `multi-device/tests/` or `multi-device/suites/` SHALL be resolved against the `finalrun` directory root. All other selector formats MUST continue to flow through the existing single-device resolution logic without modification.

#### Scenario: Multi-device selector resolves

- **GIVEN** `.finalrun/multi-device/tests/chat/send_message.yaml` exists
- **WHEN** the user runs `finalrun test multi-device/tests/chat/send_message.yaml`
- **THEN** the selector resolves to the absolute path within `.finalrun/multi-device/tests/`

#### Scenario: Single-device selector unchanged

- **GIVEN** the existing selector `auth/login.yaml`
- **WHEN** `resolveSelectorPath()` runs
- **THEN** the behavior is byte-identical to the pre-change code path

## CLI: Test Compilation

### Requirement: Multi-device compiler preserves device and secret tokens

The multi-device compiler SHALL:

- Interpolate `${variables.*}` tokens to their resolved values.
- Preserve `${devices.*}` and `${secrets.*}` tokens literally in the emitted goal string.
- Emit a prepended "Devices" header block listing each device key, platform, and app.
- Leave the existing single-device compiler (`testCompiler.ts`) unmodified.

#### Scenario: Variables interpolated, devices preserved

- **GIVEN** a test step `"${devices.alice} type \"${variables.greeting}\" and tap Send"` with `variables.greeting: "hi"`
- **WHEN** the compiler runs
- **THEN** the emitted step reads `${devices.alice} type "hi" and tap Send`

#### Scenario: Compiled goal carries devices header

- **GIVEN** `devices.yaml` with `alice (android, com.example.app1)` and `bob (android, com.example.app2)`
- **WHEN** the compiler emits the goal string
- **THEN** the goal starts with a structured "Devices" block listing both keys, platforms, and apps before the step list

## CLI: Session Runner & Orchestration Routing

### Requirement: Multi-device session runner auto-assigns hardware

`prepareMultiDeviceTestSession()` SHALL:

1. Call `DeviceNode.detectInventory()` to list connected and startable hardware.
2. For each key declared in `devices.yaml`, pick the first inventory entry whose platform matches the config and that has not already been assigned to another key.
3. Fail fast with a descriptive error if fewer than 2 matching devices exist.
4. Boot required emulators and call `setUpDevice()` on each assigned hardware entry in parallel via `Promise.all`.
5. Return a `MultiDeviceTestSession` object with two independent `DeviceAgent` instances (one per key) and a `cleanup()` method.
6. `cleanup()` SHALL invoke `stopRecording` and `tearDown` on both devices in parallel.

The existing `prepareSession()` used by single-device tests MUST remain unchanged.

#### Scenario: Successful auto-assignment

- **GIVEN** 2 Android devices detected and a `devices.yaml` with 2 Android keys
- **WHEN** the session runner starts
- **THEN** each key is bound to a distinct hardware entry in detection order
- **AND** both devices boot in parallel

#### Scenario: Insufficient devices fails fast

- **GIVEN** `devices.yaml` requires 2 Android devices and only 1 is detected
- **WHEN** the session runner starts
- **THEN** it throws with a message stating 2 Android devices are required and 1 was found

### Requirement: Test runner routing prefix branch

`testRunner` and `finalrun.ts` CLI entrypoints SHALL branch on the selector path:

- Selector starts with `multi-device/tests/` → dispatch to `MultiDeviceOrchestrator`.
- Selector starts with `multi-device/suites/` → dispatch to the multi-device suite runner.
- All other selectors → dispatch to the existing `TestExecutor` path (unchanged).

#### Scenario: Multi-device routing

- **GIVEN** selector `multi-device/tests/chat/send_message.yaml`
- **WHEN** the CLI routes the test
- **THEN** `MultiDeviceOrchestrator` runs
- **AND** `TestExecutor.run()` is never invoked for this selector

#### Scenario: Single-device routing preserved

- **GIVEN** selector `auth/login.yaml`
- **WHEN** the CLI routes the test
- **THEN** the existing `TestExecutor` path runs with byte-identical behavior

## Goal-Executor: Multi-Device Orchestrator

### Requirement: Active-device-scoped iteration loop

Each orchestrator iteration SHALL:

1. Identify the current step via `stepIndex` into the compiled step array.
2. Regex-extract `${devices.<key>}` tokens from the step text to compute `activeDevices` (1 or 2 keys).
3. Capture a fresh screenshot + UI hierarchy from each device in `activeDevices` in parallel; passive devices MUST NOT be captured or included in the planner prompt.
4. Call `aiAgent.planMulti()` with: test objective, tagged history, `remember` list, `activeDeviceStates: Record<string, {preActionScreenshot?, postActionScreenshot, hierarchy, platform}>`, full device manifest (context only).
5. Interpret the planner's `actions` array.
6. Check for terminal status (`COMPLETED`, `FAILED`) and exit the loop if any action is terminal.
7. Dispatch non-terminal actions (in parallel via `Promise.all` if 2 distinct devices, sequentially if 1).
8. Capture post-action state from the acted devices and update `lastKnownState[device]`.
9. Append one history entry per action, tagged with the device key.

#### Scenario: Sequential step activates one device

- **GIVEN** step 3 reads `"${devices.alice} tap Send"`
- **WHEN** the orchestrator enters iteration 3
- **THEN** it captures `alice` only
- **AND** `activeDeviceStates` passed to `planMulti()` contains exactly one key

#### Scenario: Parallel step activates both devices

- **GIVEN** step 7 reads `"${devices.alice} and ${devices.bob} tap Login"`
- **WHEN** the orchestrator enters iteration 7
- **THEN** it captures both `alice` and `bob` in parallel
- **AND** `activeDeviceStates` passed to `planMulti()` contains both keys

### Requirement: Step pointer maintenance

The orchestrator SHALL:

- Initialize `stepIndex = 1`.
- After each planner response, parse `thought.plan` for a `[→ <step text>]` marker and advance `stepIndex` to that step's ordinal when a parse succeeds.
- Hold `stepIndex` at its last-known value when `thought.plan` is missing or unparseable.
- Invoke a watchdog abort if the same `stepIndex` repeats for more than 5 consecutive iterations without terminal progress.

#### Scenario: Planner advances step

- **GIVEN** `stepIndex = 2` and the planner returns `thought.plan: "[✓ step 1] [→ step 3] [○ step 4]"`
- **WHEN** the orchestrator parses the plan
- **THEN** `stepIndex` advances to 3

#### Scenario: Unparseable plan holds pointer

- **GIVEN** `stepIndex = 4` and the planner returns `thought.plan: ""`
- **WHEN** the orchestrator parses the plan
- **THEN** `stepIndex` remains 4

#### Scenario: Watchdog fires on stuck step

- **GIVEN** `stepIndex = 5` for 6 consecutive iterations with no terminal status
- **WHEN** the orchestrator evaluates the watchdog
- **THEN** it aborts the test with FAIL and reason `watchdog: step 5 stuck for >5 iterations`

### Requirement: Parallel vs sequential action dispatch

The orchestrator SHALL dispatch planner `actions` as follows:

- `actions` length 1 → single `executeAction()` call on the named device.
- `actions` length 2 with **distinct** device keys → `Promise.all([executeAction(a1), executeAction(a2)])`.
- `actions` length 2 with **the same** device key → reject the response; re-invoke `planMulti()` once; if the retry also emits duplicate-device actions, abort the test with FAIL.
- `actions` length 0 → no dispatch this iteration; proceed to next capture cycle (pure observation turn).
- `actions` length > 2 → reject as malformed; retry once; abort with FAIL on repeat.
- Any action whose `device` key is not present in the validated `devices.yaml` manifest → reject the response; retry `planMulti()` once; abort the test with FAIL on repeat. <!-- clarified: 2026-04-15 — derived from fail-fast stance (assumption #4) and loader validation symmetry (assumption #14); no explicit user instruction needed. -->

#### Scenario: Unknown device key in actions triggers retry-then-fail

- **GIVEN** planner response `{actions: [{device: "charlie", ...}]}` and `devices.yaml` keys `{alice, bob}`
- **WHEN** the orchestrator validates the response
- **THEN** it invokes `planMulti()` one additional time with the same inputs
- **AND** a second response containing an unknown device key aborts the test with FAIL and reason `planner-malformed: unknown device "charlie"`

#### Scenario: Distinct-device parallel dispatch

- **GIVEN** planner response `{actions: [{device: "alice", act: "TAP", ...}, {device: "bob", act: "TAP", ...}]}`
- **WHEN** the orchestrator dispatches
- **THEN** both actions execute concurrently via `Promise.all`

#### Scenario: Duplicate-device response triggers retry

- **GIVEN** planner response `{actions: [{device: "alice", ...}, {device: "alice", ...}]}`
- **WHEN** the orchestrator receives it
- **THEN** it invokes `planMulti()` one additional time with the same inputs
- **AND** a second duplicate-device response aborts the test with FAIL

### Requirement: Fail-fast semantics

The orchestrator SHALL mark the test FAIL and terminate cleanly on any of:

- Action dispatch failure on either device (gRPC error, timeout, exception).
- Mid-run gRPC disconnect on either device.
- `PLANNER_ACTION_FAILED` emitted by the planner.
- Repeat duplicate-device response after retry.
- Watchdog threshold exceeded.

On fail-fast:

- Any in-flight action on the surviving device MUST be interrupted via an `AbortController.abort()` routed through the multi-device `DeviceExecutor.dispatchAction()` wrapper.
- Both device recordings MUST be stopped cleanly via `Promise.all`.
- Both devices MUST be torn down via the session runner's `cleanup()`.

The existing single-device `ActionExecutor` class body MUST NOT be modified; the `AbortController` path SHALL live in the new multi-device wrapper.

#### Scenario: One device fails mid-action

- **GIVEN** `alice` and `bob` dispatched in parallel, `bob.executeAction()` throws after 2 seconds
- **WHEN** the orchestrator observes the rejection
- **THEN** it aborts `alice`'s in-flight action via `AbortController`
- **AND** stops both recordings via `Promise.all`
- **AND** records the test as FAIL with reason `device-failure: bob`
- **AND** completes cleanup within 5 seconds

#### Scenario: gRPC disconnect on observer device

- **GIVEN** `alice` is acting and `bob` is idle when `bob`'s gRPC channel closes unexpectedly
- **WHEN** the orchestrator detects the disconnect
- **THEN** it aborts the test with FAIL
- **AND** `alice`'s in-flight action is interrupted

## Goal-Executor: AI Planner (planMulti + Prompt)

### Requirement: planMulti() sibling API

`AIAgent.planMulti(request: MultiDevicePlannerRequest): Promise<MultiDevicePlannerResponse>` SHALL be added to `AIAgent`. It MUST:

- Use the same Vercel AI SDK `generateText` + `Output.json()` path as the existing `plan()`.
- Build the user message programmatically so per-active-device blocks (1 or 2) can be injected as separate message parts.
- Use an output-token budget identical to `plan()`.
- Never modify the existing `plan()` method, `PlannerRequest`, or `PlannerResponse` types.

`MultiDevicePlannerRequest` MUST include: `testObjective`, `devices` (full manifest), `activeDeviceStates` (record keyed by active device key), optional `history`, optional `remember`, optional `preContext`, optional `traceStep`.

`MultiDevicePlannerResponse` MUST include: `actions: Array<{device, action: PlannerAction}>`, optional `remember: Array<{device, note}>`, optional `thought: {plan?, think?, act?}`, optional `trace`.

`PlannerAction` is a structural type with the action-shape subset used by both sibling responses (act, reason, text, clearText, direction, durationSeconds, url, repeat, delayBetweenTapMs, result, analysis, severity). It MUST NOT alter `PlannerResponse`.

#### Scenario: Single-device plan() unchanged

- **GIVEN** a single-device test calling `AIAgent.plan(singleDeviceRequest)`
- **WHEN** the call executes
- **THEN** the signature, behavior, and prompt are byte-identical to pre-change code

#### Scenario: planMulti() returns well-formed response

- **GIVEN** a mock `MultiDevicePlannerRequest` with both devices active
- **WHEN** `planMulti()` completes
- **THEN** the response parses to `MultiDevicePlannerResponse`
- **AND** every entry in `actions` has a valid `device` key matching a key in the request's `devices` manifest

### Requirement: Multi-device planner prompt

`packages/goal-executor/src/prompts/multi-device-planner.md` SHALL be authored as a sibling to `planner.md`. It MUST:

- Describe a device manifest with exactly 2 keys and their platforms.
- Describe the `<turn_loop>` identically to `planner.md` in structure (read history → compare pre/post → check screen state → locate in test case → plan + act), scoped to the active-device set provided that turn.
- Describe `<output_schema>` with `actions: [...]` replacing single-action output, `remember` as device-tagged notes.
- Copy the `<actions>` catalog from `planner.md` and note that each action carries a device tag.
- Scope `<stagnation_and_retries>` element identity as `{device}:{element}`; test-level stagnation fires only when both devices stagnate in the same turn.
- State the parallel-actions rule: 2 actions are allowed iff the current step references both devices and the actions are independent.
- State the cross-device causality protocol: when alice's step produces an effect on bob, bob's first fresh capture next iteration observes that effect.
- State that `planner.md` and the single-device path are unrelated to multi-device execution.

The existing `packages/goal-executor/src/prompts/planner.md` MUST remain unchanged.

#### Scenario: Prompt covers parallel-step guidance

- **GIVEN** the multi-device prompt is rendered into a request
- **WHEN** the planner produces output
- **THEN** the response complies with the "2 actions iff step names both devices" rule

#### Scenario: Single-device prompt untouched

- **GIVEN** the single-device test pipeline
- **WHEN** `AIAgent.plan()` loads its prompt
- **THEN** the loaded file content is byte-identical to pre-change `planner.md`

## Device-Node: Recording Manager

### Requirement: getMapKey non-breaking fix

`RecordingManager.getMapKey(runId, testId, deviceId?: string)` SHALL accept an optional third argument. The return value MUST be:

- `${runId}###${testId}` when `deviceId` is `undefined` or empty (byte-identical to pre-change behavior).
- `${runId}###${testId}###${deviceId}` when `deviceId` is a non-empty string.

All existing single-device call sites MUST continue to pass only 2 arguments and MUST continue to produce 2-part keys. Multi-device callers SHALL pass `deviceId` explicitly.

Device keys passed as `deviceId` MUST be sanitized to prevent collision with `MAP_KEY_DELIMITER` (`###`). Since the loader already enforces that keys do not contain `###`, this is a defense-in-depth check rather than a new behavior.

#### Scenario: Single-device key byte-identical

- **GIVEN** `runId = "abc"` and `testId = "login"`
- **WHEN** `getMapKey("abc", "login")` is called (no 3rd arg)
- **THEN** the return value is `"abc###login"` (byte-identical to pre-change)

#### Scenario: Multi-device key includes device

- **GIVEN** `runId = "abc"`, `testId = "login"`, `deviceId = "alice"`
- **WHEN** `getMapKey("abc", "login", "alice")` is called
- **THEN** the return value is `"abc###login###alice"`

### Requirement: Parallel recording per run+test

Multi-device callers SHALL invoke `startRecording()` and `stopRecording()` on both devices in parallel for the same `(runId, testId)` pair, each with a distinct `deviceId`. The recording map MUST store one entry per `(runId, testId, deviceId)` tuple without collision.

#### Scenario: Parallel start succeeds

- **GIVEN** 2 Android emulators with independent recording providers
- **WHEN** `Promise.all([startRecording({...runId, testId, deviceId: "alice"}), startRecording({...runId, testId, deviceId: "bob"})])` runs
- **THEN** both calls succeed
- **AND** two distinct entries live in `_recordingProcessMap`

#### Scenario: Parallel stop closes both

- **GIVEN** two active recordings for the same run+test with distinct devices
- **WHEN** `Promise.all([stopRecording(...alice), stopRecording(...bob)])` runs
- **THEN** both recordings stop cleanly and produce output files

## Common: Data Models

### Requirement: MultiDeviceConfig type

`packages/common/src/models/MultiDeviceConfig.ts` SHALL export `DeviceDefinition` (`{platform: string, app: string}`) and `MultiDeviceConfig` (`{devices: Record<string, DeviceDefinition>}`). These types MUST be used by the multi-device loader and session runner.

#### Scenario: Loader and runner share types

- **GIVEN** loader output typed as `MultiDeviceConfig`
- **WHEN** passed to the session runner
- **THEN** the types align without casts or shims

### Requirement: Optional per-device fields on AgentAction and TestResult

`AgentAction` SHALL gain an optional `device?: string` field. Single-device runs MUST omit this field (serialized as `undefined`, absent in JSON). Multi-device runs MUST set it to the active device key.

`TestResult` SHALL gain an optional `perDeviceArtifacts?: Record<string, {folder: string, recordingFile?: string, deviceLogFile?: string, recordingStartedAt?: string}>` field. Single-device runs MUST omit it.

#### Scenario: Single-device JSON unchanged

- **GIVEN** a single-device test run
- **WHEN** the `TestResult` is serialized
- **THEN** neither `device` on actions nor `perDeviceArtifacts` on the result is present

#### Scenario: Multi-device JSON includes per-device block

- **GIVEN** a multi-device run with alice and bob
- **WHEN** the `TestResult` is serialized
- **THEN** every `AgentAction` includes `device`
- **AND** `perDeviceArtifacts` contains entries for both device keys

### Requirement: Optional multiDevice block on RunManifest

`RunManifest` SHALL gain an optional `multiDevice?: {devices: Record<string, {platform: string, app?: string, hardwareName: string}>}` field. Single-device runs MUST omit it.

#### Scenario: Run-level manifest carries device list

- **GIVEN** a multi-device run on 2 Android emulators
- **WHEN** the run manifest is serialized
- **THEN** `multiDevice.devices` lists both keys with the assigned hardware names

## CLI: Report Writer

### Requirement: Per-device artifact layout

`reportWriter.writeTestRecord()` SHALL branch at entry on `result.multiDevice` presence:

- Absent → existing single-device path with byte-identical output tree.
- Present → for each device key, write screenshots and action JSON to `tests/{testId}/<device>/{screenshots,actions}/`. Each action JSON MUST include the `device` field. `videoOffsetMs` SHALL be computed per-device as `max(0, stepTimestamp - deviceRecordingStartedAt)`.

Step numbering in multi-device is shared across devices: `stepNumber = iteration` (1-indexed, zero-padded 3 digits). Sparse slots are allowed — a sequential step at iteration N writes only the acted device's file; the inactive device's slot is intentionally absent on disk.

#### Scenario: Single-device layout unchanged

- **GIVEN** a single-device test run for `auth/login.yaml`
- **WHEN** the report writer runs
- **THEN** the artifact tree is byte-identical to the baseline pre-change

#### Scenario: Multi-device parallel step fills both slots

- **GIVEN** iteration 7 is a parallel step acting on both devices
- **WHEN** the report writer emits artifacts
- **THEN** both `tests/chat/alice/actions/007.json` and `tests/chat/bob/actions/007.json` exist
- **AND** each file contains the respective device's action

#### Scenario: Multi-device sequential step leaves sparse slot

- **GIVEN** iteration 8 acts only on alice
- **WHEN** the report writer emits artifacts
- **THEN** `tests/chat/alice/actions/008.json` exists
- **AND** `tests/chat/bob/actions/008.json` is absent

### Requirement: Per-device video offset

`videoOffsetMs` SHALL be stored per device per step, anchored on that device's own `recordingStartedAt`. The report's shared scrubber anchors t=0 at `min(alice.startedAt, bob.startedAt)`.

#### Scenario: Offset computed from device-local start

- **GIVEN** `alice.recordingStartedAt = 10:00:00.000` and the action fires at `10:00:05.250`
- **WHEN** `videoOffsetMs` is computed for alice's step
- **THEN** the value is `5250`

## Report-Web: Sandwich UI Rendering

### Requirement: Render branch on manifest.multiDevice

`renderTestDetailSection()` SHALL branch at entry:

- `manifest.multiDevice` absent → existing single-device rendering path, untouched.
- `manifest.multiDevice` present → `renderMultiDeviceWorkspace()`.

`toTestViewModel()` SHALL map `perDeviceArtifacts` into per-device video and log URLs only when `multiDevice` is present.

Existing single-device renderers (`renderStepButton`, `renderDeviceLogLines`, the existing workspace grid) MUST NOT be modified.

#### Scenario: Single-device report unchanged

- **GIVEN** a single-device run JSON without `multiDevice`
- **WHEN** the report is rendered
- **THEN** the output HTML is byte-identical to baseline

#### Scenario: Multi-device report enters new path

- **GIVEN** a run JSON with `multiDevice`
- **WHEN** the report is rendered
- **THEN** `renderMultiDeviceWorkspace()` emits the 3-column sandwich layout

### Requirement: Sandwich layout

`renderSandwichGrid()` SHALL emit a CSS grid with columns `200px minmax(0,1fr) 200px`, gap `12px`, align-items `start`. Three cells:

- **Left** — `renderDeviceColumn('alice', 'left')`: header with dot `#7F77DD`, device name, platform label; below, a `<video data-device="alice" data-role="recording-video">` with `aspect-ratio: 9/19; border-radius: 14px`.
- **Centre** — `renderStepTimelinePanel(steps)`: `min-height: 380px`, primary background, secondary border, radius-md, padding `10px 8px`. Emits one chat bubble per step via `renderChatBubbleStep()`.
- **Right** — `renderDeviceColumn('bob', 'right')`: header reversed (`justify-content: flex-end`), dot `#1D9E75`, mirrored structure.

#### Scenario: Grid structure matches mock

- **GIVEN** a multi-device run
- **WHEN** the sandwich grid renders
- **THEN** the CSS grid-template-columns is `200px minmax(0,1fr) 200px`
- **AND** alice appears in the left cell and bob in the right

### Requirement: Chat-bubble step rendering

`renderChatBubbleStep(step)` SHALL produce:

- **alice step** — flex justify-content start; bubble `max-width: 78%; background: #EEEDFE; border-left: 2px solid #7F77DD; border-radius: 0 8px 8px 0; padding: 6px 10px`; label `alice · <timestamp>` colored `#534AB7`; text colored `#26215C`.
- **bob step** — flex justify-content end; bubble `background: #E1F5EE; border-right: 2px solid #1D9E75; border-radius: 8px 0 0 8px; text-align: right`; label `<timestamp> · bob` colored `#0F6E56`; text colored `#04342C`.
- **parallel step** (actions from both devices in the same iteration) — full-width outer; dashed-border centered bubble; label `<timestamp> · alice + bob · parallel`.
- **selected step** — `box-shadow: 0 0 0 2px #AFA9EC` for alice or the equivalent bob tint.

Sparse-slot treatment (inactive device in a sequential step): the inactive device's column SHALL render a 1px-tall dimmed spacer at that iteration's row to preserve vertical alignment with the scrubber segments; it MUST NOT emit a full empty bubble.

#### Scenario: Alice bubble colors

- **GIVEN** an alice-only step
- **WHEN** `renderChatBubbleStep()` runs
- **THEN** the emitted HTML includes `background: #EEEDFE`, `border-left: 2px solid #7F77DD`, and label color `#534AB7`

#### Scenario: Parallel bubble centered and dashed

- **GIVEN** an iteration dispatching 2 distinct-device actions
- **WHEN** `renderChatBubbleStep()` runs
- **THEN** the emitted bubble has a dashed border and label `<timestamp> · alice + bob · parallel`

#### Scenario: Sparse slot reserves space

- **GIVEN** iteration 8 is alice-only
- **WHEN** the bob column is rendered for iteration 8
- **THEN** a 1px dimmed spacer element occupies the row
- **AND** no full bubble is emitted for bob

### Requirement: Synced timeline scrubber

`renderSyncedScrubber(steps, devices)` SHALL emit:

- Label: `"synced timeline — scrub both devices"`.
- Track: `height: 20px; background: secondary; border-radius: 4px`.
- For each step-device pair, an absolute-positioned segment with `left = (step.startMs / totalMs) * 100%`, `width = (step.durationMs / totalMs) * 100%`, `height: 5px; top: 4px`, color `#7F77DD` for alice, `#1D9E75` for bob, or `linear-gradient(90deg, #7F77DD, #1D9E75)` for parallel steps.
- Playhead: absolute, `top: 0; bottom: 0; width: 1px; background: var(--color-text-primary)`. Its position updates via a `timeupdate` listener on the first `<video>` element.

#### Scenario: Segment colors reflect device

- **GIVEN** a step authored by bob only
- **WHEN** the scrubber renders
- **THEN** its segment uses `#1D9E75`

### Requirement: Synced playback controls

Three JavaScript functions SHALL be added to the inline report-web script block:

- `selectStep(testId, stepIndex, perDeviceOffsets)` — seeks each device's `<video>` to `perDeviceOffsets[device] / 1000` seconds and toggles a `.selected` class on the corresponding bubble.
- `togglePlayPause(testId)` — if any tracked `<video>` is playing, pauses all; otherwise plays all (autoplay rejections swallowed).
- `onTimelineClick(testId, event)` — computes the clicked ratio across the scrubber track and seeks all tracked `<video>` elements to the corresponding time.

These functions MUST operate only on containers with `data-test-id` attributes that match the multi-device branch — they MUST NOT affect single-device test containers.

#### Scenario: Click bubble seeks both videos

- **GIVEN** alice's step fires at `0:03` and bob's earliest recording starts at `0:01`
- **WHEN** the user clicks bob's bubble for iteration that fired at `0:12`
- **THEN** bob's `<video>` seeks to `0:11` (12 − 1)
- **AND** alice's `<video>` seeks to `0:12 − alice.recordingStartedAt`

#### Scenario: Timeline click seeks both

- **GIVEN** the user clicks the scrubber at 50% of its width
- **WHEN** `onTimelineClick()` runs
- **THEN** both `<video>` elements seek to the same relative position

## Report-Web: Artifacts Loader

### Requirement: Per-device log tails

`artifacts.ts` SHALL branch on `multiDevice`:

- Absent → existing log-loading path, unmodified.
- Present → load the tail of each device's log file independently, keyed by device key.

The existing single-device log tail path MUST remain byte-identical.

#### Scenario: Single-device log tail unchanged

- **GIVEN** a single-device test
- **WHEN** the artifacts loader runs
- **THEN** the emitted log data matches pre-change baseline byte-for-byte

#### Scenario: Multi-device log tails per device

- **GIVEN** a multi-device run with log files for alice and bob
- **WHEN** the artifacts loader runs
- **THEN** the view model contains both log tails keyed by device

## Cross-Cutting: Single-Device Preservation

### Requirement: Byte-identical single-device regression

Every file listed in the Single-Device Preservation audit (intake §Impact) MUST either remain unmodified OR modify only additive, feature-gated branches that never execute when `multiDevice` fields are absent. The regression test matrix SHALL verify:

- Single-device Android `auth/login.yaml`: artifact tree + `run.json` byte-identical to baseline.
- Single-device iOS equivalent: byte-identical.
- Single-device suite `smoke.yaml`: batch behavior unchanged.
- Single-device HTML report: visual diff of 0 vs baseline.

#### Scenario: Android single-device regression

- **GIVEN** `auth/login.yaml` run on Android before and after this change
- **WHEN** the two artifact trees are diffed
- **THEN** the diff is empty

#### Scenario: iOS single-device regression

- **GIVEN** the same test run on an iOS simulator before and after this change
- **WHEN** the two artifact trees are diffed
- **THEN** the diff is empty

#### Scenario: Single-device HTML report visual diff

- **GIVEN** the single-device report rendered from baseline and post-change run JSONs
- **WHEN** the HTML outputs are diffed
- **THEN** the diff is empty

## Design Decisions

1. **Active-device-scoped capture** per iteration (alternative rejected: always-both capture)
   - *Why*: Mirrors `planner.md` mental model; token cost scales with step device count, not device pool size; matches user's explicit pushback during discussion.
   - *Rejected*: Always-both doubles token cost on sequential steps without planner benefit; observer device's unchanged state adds noise to reasoning.

2. **Sibling planner types and method** (alternative rejected: mutate `PlannerResponse`)
   - *Why*: Protects ~15 single-device call sites; any regression surface is confined to the new `planMulti()` path.
   - *Rejected*: Adding an optional `device` to `PlannerResponse` would require every caller to narrow the type; risks cascading regressions across `TestExecutor`.

3. **Non-breaking `getMapKey` optional 3rd arg** (alternative rejected: rename/resign signature)
   - *Why*: Preserves byte-identical 2-arg keys for all existing call sites; new 3-arg behavior is opt-in.
   - *Rejected*: A signature change would force every recording call site to update; risks breaking single-device recording.

4. **Sandwich UI from mock** (alternative rejected: side-by-side videos)
   - *Why*: Chat bubbles in a shared middle column make cross-device causality readable at a glance; user provided the mock as canonical.
   - *Rejected*: Side-by-side videos with synced scrubber below are harder to correlate action↔effect; does not represent the cross-device narrative.

5. **Auto-assign from detection order** (alternative rejected: interactive prompt)
   - *Why*: CI compatibility, zero-friction local runs.
   - *Rejected*: Interactive prompts break headless execution.

6. **Fail-fast over best-effort** (alternative rejected: continue with one device on failure)
   - *Why*: Multi-device coupling means partial results are misleading; the test premise (2-device coordination) is void if one device fails.
   - *Rejected*: Best-effort would require complex partial-result reporting and risks false-positive passes.

7. **`thought.plan` marker-driven step pointer** (alternative rejected: externally-tracked step counter)
   - *Why*: Reuses the single-device planner's existing output convention; no schema changes.
   - *Rejected*: An external counter would require the orchestrator to guess when a step completes; inaccurate for wait/polling steps.

## Clarifications

### Session 2026-04-15 (auto)

| Gap | Resolution |
|-----|------------|
| No edge-case scenario for 0 or 1 device entries in `devices.yaml` (only 3+ shown). | Added "Empty or single-device config rejected" scenario under `devices.yaml validation`. Derived from assumption #1 (exactly 2). |
| No requirement covering planner emitting an action with a device key absent from `devices.yaml`. | Added new bullet + scenario "Unknown device key in actions triggers retry-then-fail" under `Parallel vs sequential action dispatch`. Derived from assumption #4 fail-fast stance. |
| Assumption #16 deferred the AbortController cancellation timeout entirely ("2s budget to be validated"). | Pinned 2s as the working default with explicit linkage to the 5s cleanup ceiling in assumption #4; validation deferred to Phase 3 design review per intake Open Questions. |

## Assumptions

| # | Grade | Decision | Rationale | Scores |
|---|-------|----------|-----------|--------|
| 1 | Certain | Multi-device v1 supports exactly 2 devices, hard-validated by loader. | Confirmed from intake #1. Scope locked in /fab-discuss; 3+ not in v1. | S:95 R:95 A:90 D:90 |
| 2 | Certain | Both devices share the same platform, and that platform MUST be `android` in v1. iOS rejected at load time. | Confirmed from intake #2. Based on incomplete iOS recording stack. | S:95 R:95 A:85 D:85 |
| 3 | Certain | Hardware auto-assigned from `DeviceNode.detectInventory()` in detection order. No interactive prompts. | Confirmed from intake #3. Required for CI compatibility. | S:95 R:90 A:90 D:85 |
| 4 | Certain | Fail-fast on device failure, gRPC disconnect, expected-state divergence, or duplicate-device planner output after retry. `AbortController` interrupts surviving in-flight action; both recordings close cleanly within 5 seconds. | Confirmed from intake #4 + #17. Spec scenario pinned a 5s cleanup ceiling. | S:95 R:90 A:90 D:85 |
| 5 | Certain | Active-device-scoped capture. Each iteration parses the current step's `${devices.*}` tokens to determine active devices; passive devices are not captured. | Confirmed from intake #5. User pushback during discussion made this the architecture's foundation. | S:95 R:95 A:95 D:90 |
| 6 | Certain | Single-device Android and iOS paths remain byte-identical. All multi-device additions are additive and feature-gated at branch points. Regression matrix required before ship. | Confirmed from intake #6. Multiple spec requirements encode this as scenarios. | S:95 R:95 A:95 D:95 |
| 7 | Certain | Sibling planner types — `PlannerResponse` and `planner.md` untouched; `planMulti()`, `MultiDevicePlannerRequest/Response`, and `PlannerAction` added. | Confirmed from intake #7. | S:95 R:95 A:90 D:90 |
| 8 | Certain | `RecordingManager.getMapKey()` gains an optional third argument. Omitted → byte-identical 2-part key. Provided → 3-part key with device. | Confirmed from intake #8. | S:95 R:90 A:85 D:90 |
| 9 | Certain | Sandwich UI layout per `/Users/ashishyadav/Downloads/multi_device_sandwich_layout.html`: 3 columns `200px minmax(0,1fr) 200px`, chat bubbles center (alice left purple, bob right green, parallel dashed), shared timeline scrubber below. | Confirmed from intake #9. | S:95 R:90 A:90 D:80 |
| 10 | Certain | Per-device video sync. Each device stamps its own `recordingStartedAt`; per-step `videoOffsetMs = max(0, stepTimestamp - deviceRecordingStartedAt)`. Shared scrubber anchors at `min(alice.startedAt, bob.startedAt)`. | Confirmed from intake #10. | S:90 R:90 A:85 D:85 |
| 11 | Certain | Per-device stagnation scoping — element identity is `{device}:{element}`; test-level stagnation fires only when both devices stagnate in the same turn. | Confirmed from intake #11. | S:90 R:90 A:85 D:85 |
| 12 | Certain | No tool-calling planner for v1 — single `planMulti()` call per iteration; no mid-turn state-refresh tools. | Confirmed from intake #12. Deferred to v2. | S:95 R:90 A:90 D:80 |
| 13 | Certain | `ensureWorkspaceDirectories()` requires at least one of `.finalrun/tests/` or `.finalrun/multi-device/tests/`. Workspaces with both succeed; workspaces with neither fail with a message naming both. | Confirmed from intake #13. Covered by four workspace-shape scenarios. | S:95 R:95 A:90 D:90 |
| 14 | Certain | `${devices.*}` tokens may appear anywhere in a step string. Loader regex `/\$\{(variables\|secrets\|devices)\.([A-Za-z0-9_-]+)\}/g` extracts the unique device set per step; 1 required, 2 distinct = parallel-capable. | Confirmed from intake #14. | S:90 R:90 A:85 D:85 |
| 15 | Certain | Step pointer advances from `thought.plan` `[→ step-text]` marker; initial `stepIndex = 1`; fallback holds pointer; watchdog fires after 5 consecutive iterations without terminal progress. | Confirmed from intake #15 + #16 (now Certain after bulk confirm). | S:95 R:85 A:80 D:80 |
| 16 | Certain | `AbortController` threading via new `DeviceExecutor.dispatchAction()` wrapper. Single-device `ActionExecutor` class body untouched. Cancellation semantics: graceful gRPC call-stream cancel on `abort()`; hard teardown on cancellation timeout. Working budget = 2 seconds (matches the "5s cleanup ceiling" in assumption #4: 2s graceful + 3s recordings/teardown). Subject to empirical validation in the Phase 3 spike. | Confirmed from intake #17. <!-- clarified: 2026-04-15 — pinned the 2s default explicitly (was "to be validated"); validation deferred to Phase 3 design review per intake Open Questions. --> | S:95 R:85 A:75 D:75 |
| 17 | Certain | Multi-device suites reference multi-device tests only. No mixed-mode suites. Suite runner branches once at the top on the first test's path prefix. | Confirmed from intake #18. | S:95 R:80 A:75 D:75 |
| 18 | Certain | Sparse-slot UI rendering: inactive device's row shows a 1px dimmed spacer preserving vertical alignment; no full empty bubble. Parallel steps fill both columns. | Confirmed from intake #19. Minor render decision resolved during clarify. | S:95 R:80 A:90 D:75 |
| 19 | Certain | Auto-clarify / status-check gate: confidence ≥ 3.0 at intake, ≥ per-type threshold at spec. Scoring reads only this spec's Assumptions table. | Standard fab-ff gate mechanics. | S:95 R:95 A:95 D:95 |
| 20 | Certain | Report-web new renderers (`renderMultiDeviceWorkspace`, `renderSandwichGrid`, `renderChatBubbleStep`, `renderSyncedScrubber`) and JS functions (`selectStep`, `togglePlayPause`, `onTimelineClick`) are scoped by `data-test-id` containers carrying the multi-device branch; single-device test containers never invoke them. | Derived from intake + render-branch requirement. Prevents accidental single-device interaction. | S:95 R:90 A:95 D:90 |
| 21 | Confident | Step-pointer parser requires exact `[→ ...]` marker format from the planner. Ambiguous or missing markers hold the pointer; the watchdog catches runaway. | Parser is conservative by design. Real-world multi-device runs have not yet stressed the parser. | S:85 R:80 A:80 D:75 |
| 22 | Confident | Inventory detection order is stable within a single invocation of `DeviceNode.detectInventory()` but not across invocations. Auto-assignment is deterministic per run but may assign alice/bob to different physical devices across runs. | Follows platform behavior of `adb devices`/`ideviceinstaller`. For CI this is acceptable since both hardware slots are identical emulators. | S:85 R:80 A:75 D:75 |
| 23 | Confident | gRPC concurrency spike (Risk B) is scheduled at the start of Phase 3; Phase 3 implementation is gated on the spike's outcome. If `DeviceNode.getInstance()` singleton shows cross-talk, a refactor precedes orchestrator work. | Existing `DeviceNode` singleton is a yellow flag. Spike is a timeboxed half-day. | S:80 R:75 A:75 D:75 |

23 assumptions (20 certain, 3 confident, 0 tentative, 0 unresolved).
