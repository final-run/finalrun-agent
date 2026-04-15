# Multi-Device Orchestration (cli)

How the CLI loads, compiles, and routes multi-device tests into the `MultiDeviceOrchestrator`. Introduced by change `260415-1mzp-multi-device-orchestration`.

## Loader: `multiDeviceTestLoader.ts`

`packages/cli/src/multiDeviceTestLoader.ts` parses `.finalrun/multi-device/` workspaces. Validation invariants (all hard-fail):

- Exactly 2 entries under `devices:` in `devices.yaml` (not 1, not 3+).
- Both entries share identical `platform`; v1 rejects any value other than `android`.
- Both entries carry a non-empty `app`.
- Keys match `[A-Za-z0-9_-]+` and never contain `###` (the `MAP_KEY_DELIMITER`).
- Every step in every multi-device test YAML references at least one `${devices.<key>}` token; unknown keys fail-fast with the offending step identified.

Token regex (shared with the orchestrator): `/\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g`.

## Compiler: `multiDeviceTestCompiler.ts`

`packages/cli/src/multiDeviceTestCompiler.ts` is a sibling to `testCompiler.ts` (single-device compiler untouched). Emits a goal string:

- Interpolates `${variables.*}` eagerly.
- Preserves `${devices.*}` and `${secrets.*}` literally for the planner.
- Prepends a "Devices" header block listing each key, platform, and app before the numbered steps.

## Session Runner: `multiDeviceSessionRunner.ts`

`prepareMultiDeviceTestSession()` in `packages/cli/src/multiDeviceSessionRunner.ts`:

1. Calls `DeviceNode.detectInventory()` and picks the first matching inventory entry for each key in declaration order. No interactive prompts (CI-compatible).
2. Fails fast when fewer than 2 matching devices exist (message names the requested count and found count).
3. Boots emulators and calls `setUpDevice()` on each device via `Promise.all`.
4. Returns `MultiDeviceTestSession` with two independent `DeviceAgent` instances and a `cleanup()` method that invokes `stopRecording` and `tearDown` on both devices in parallel.

Detection order is stable within one `detectInventory()` call but not across runs — auto-assignment is deterministic per invocation only.

## Router Branch

`packages/cli/src/testRunner.ts` and the CLI entrypoint branch on the selector prefix:

| Selector prefix | Dispatch |
|-----------------|----------|
| `multi-device/tests/` | `MultiDeviceOrchestrator` via `multiDeviceTestRunner.ts` |
| `multi-device/suites/` | Multi-device suite runner |
| anything else | Existing `TestExecutor` (byte-identical) |

Mixed selectors in one invocation are rejected at parse time. The multi-device test runner composes `prepareMultiDeviceTestSession()` + `MultiDeviceOrchestrator` + `reportWriter.writeTestRecord()`.

## Per-Device Report Writer Branch

`reportWriter.writeTestRecord()` branches on `result.multiDevice` at entry. Present → per-device subfolders `tests/{testId}/<deviceKey>/{screenshots,actions}/`. Absent → byte-identical single-device output.

Key rules for the multi-device path:
- Step numbering is shared across devices: `stepNumber = iteration`, zero-padded 3 digits.
- Sequential step acting on alice writes `tests/{testId}/alice/actions/008.json`; bob's slot 008 is **absent on disk** (sparse). The report UI renders a dimmed spacer for the inactive device.
- Parallel step fills both slots at the same iteration number.
- Each `AgentAction` JSON includes the `device` key field.
- `videoOffsetMs` is computed per device: `max(0, stepTimestamp - deviceRecordingStartedAt)`. The shared report scrubber anchors t=0 at `min(alice.startedAt, bob.startedAt)`.

## Key Design Decisions (from change 260415-1mzp)

- **Router-level branching, not `TestExecutor` subclassing** — `MultiDeviceOrchestrator` is a sibling. `TestExecutor` stays untouched so the single-device regression surface is zero.
- **Multi-device suites reference multi-device tests only** — no mixed-mode suites. Suite runner branches once on the first test's prefix.
- **Feature-gated writes** — every multi-device field is optional in JSON and absent in single-device output, making `run.json` byte-identical to baseline for single-device runs.
