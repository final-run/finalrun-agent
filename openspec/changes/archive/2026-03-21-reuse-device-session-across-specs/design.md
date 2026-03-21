# Design

## Current State

Multi-spec selection happens in `packages/cli/src/testRunner.ts`, but execution still loops over specs and calls `runGoal()` separately for each one.

That means `runGoal()` currently owns all of these responsibilities:

- device detection
- platform selection
- `DeviceNode` initialization
- `setUpDevice()` driver setup
- optional app override installation
- per-spec recording
- executor creation
- final cleanup via `deviceNode.cleanup()`

This is fine for a single-spec CLI command, but it is the wrong abstraction for a batch runner because cleanup happens at the end of every spec.

## Root Cause

The current split looks like this:

```text
runTests()
  -> resolve platform once
  -> for each spec:
       runGoal()
         -> detect devices
         -> set up device + gRPC
         -> run executor
         -> cleanup device node
```

The expensive reconnect happens because `runGoal()` is both:

- a public single-spec convenience entrypoint
- the internal primitive used by the batch runner

Those concerns need to be separated.

## Recommended Refactor

Introduce a reusable device-session layer under `goalRunner`.

Recommended structure:

```text
prepareGoalSession()
  -> detect devices
  -> select platform/device
  -> initialize DeviceNode
  -> set up driver + gRPC
  -> optionally install app override
  -> return session

executeGoalOnSession()
  -> create AI agent
  -> create executor
  -> start per-spec recording
  -> execute goal
  -> stop/abort per-spec recording
  -> return GoalResult

cleanupGoalSession()
  -> deviceNode.cleanup()

runGoal()
  -> prepareGoalSession()
  -> executeGoalOnSession()
  -> cleanupGoalSession()
```

Then `runTests()` should do:

```text
runTests()
  -> runCheck()
  -> prepareGoalSession() once
  -> for each spec:
       executeGoalOnSession()
  -> cleanupGoalSession() once
```

## Session Shape

Add a reusable session object in `packages/cli/src/goalRunner.ts`.

Suggested shape:

```ts
interface GoalSession {
  deviceNode: GoalRunnerDeviceNode;
  device: GoalRunnerDevice;
  deviceInfo: DeviceInfo;
  platform: string;
  cleanup(): Promise<void>;
}
```

This session should contain only the reusable device-side state. It should not contain spec-specific artifacts such as:

- compiled goal text
- per-spec recording metadata
- per-spec report output
- executor result state

## Batch Execution Semantics

### Shared Across the Whole Batch

- device detection
- platform selection
- driver installation and gRPC connection
- app override installation
- `Device` instance reuse

### Recreated Per Spec

- compiled goal content
- AI agent
- `HeadlessGoalExecutor`
- recording start/stop
- report writer record creation
- per-spec success/failure metadata

This gives the speed benefit without smearing result data across specs.

## Recording Behavior

Recording should remain per spec, not per batch.

That means `executeGoalOnSession()` should still:

1. start recording for the current spec
2. execute the goal
3. stop recording for the current spec
4. attach the returned recording to that spec result

This preserves the current artifact model:

- one recording file per spec
- one result artifact tree per spec

## Failure Handling

Recommended policy:

### Session Preparation Failure

If `prepareGoalSession()` fails, the whole batch fails before the first spec. This matches the current behavior.

### Spec-Level Functional Failure

If the executor returns a normal `GoalResult` with `success: false`, continue using the same shared session unless current `runTests()` semantics say otherwise. This is a normal spec result, not a transport failure.

### Session/Transport Failure Mid-Batch

If `executeGoalOnSession()` throws because the shared device session is unhealthy, record the current spec as failed and stop the batch.

Examples:

- gRPC disconnected
- device disappeared
- recording controller throws due broken device state

This is safer than attempting automatic session recovery in v1.

## App State Between Specs

Reusing the device connection does not automatically reset app state between specs.

That is acceptable for the first version of this refactor because the current request is about eliminating repeated reconnects, not designing a full isolation model.

Explicit non-goal for v1:

- no automatic app relaunch, reinstall, or state wipe between specs

If spec leakage becomes a practical problem later, that can be added as a separate change.

## API Compatibility

Keep `runGoal()` as the current single-spec public API. It should become a thin wrapper over the new lower-level session helpers.

This avoids spreading churn across callers and preserves:

- CLI single-spec behavior
- existing tests that exercise `runGoal()`
- future reuse by any caller that still wants isolated single-spec execution

## Impacted Files

- `packages/cli/src/goalRunner.ts`
- `packages/cli/src/testRunner.ts`
- `packages/cli/src/goalRunner.test.ts`
- `packages/cli/src/testRunner.test.ts`

Potentially touched if helper types need export changes:

- `packages/cli/src/index.ts`
- `packages/common/src/interfaces/Agent.ts` only if a reusable session helper unexpectedly requires type widening

No design changes are expected in:

- `packages/device-node/src/grpc/GrpcDriverSetup.ts`
- `packages/device-node/src/device/Device.ts`
- `packages/cli/src/reportWriter.ts`
- selector or workspace code

## Test Plan

Add or update tests for:

- `runTests()` prepares the device session once for multiple specs
- `runTests()` cleans up the shared session once at the end of the batch
- recording still starts and stops once per spec
- app override installation happens once per batch, not once per spec
- `runGoal()` still performs isolated setup and teardown for single-spec calls
- a thrown shared-session failure stops the batch after recording the current spec failure

## Risks

- reusing one session may expose app-state leakage between specs
- if cleanup is only moved to batch scope without refactoring recording scope, recordings could leak or overlap
- session ownership must be explicit so single-spec and batch flows do not double-clean up the same device

## Resolved Decisions

1. Reuse the device session for the whole `runTests()` batch.
2. Keep recording scoped per spec.
3. Keep `runGoal()` as a public single-spec wrapper.
4. Do not add automatic per-spec app-state reset in this change.
5. Abort the remaining batch if the shared transport/session becomes unhealthy.
