# Reuse One Device Session Across Multi-Spec Runs

## Why

`finalrun test` can now select multiple YAML specs in one invocation, but the execution path still treats each selected spec as a fully isolated single-goal run.

That means a batch run currently does this for every spec:

- detect devices again
- set up the device again
- reconnect the gRPC driver again
- clean up and close the connection again

This creates avoidable overhead for multi-spec runs and makes the new multi-selector CLI feel slower than it should.

## Proposed Change

Refactor the runner so one `finalrun test` batch reuses a single prepared device session across all selected specs.

The batch should:

- detect and select the device once
- install or connect the driver once
- reuse that live device session for each spec in the batch
- keep recording, reporting, and goal execution results isolated per spec
- clean up the shared session once after the batch completes or aborts

## Scope

- split session setup and teardown out of `packages/cli/src/goalRunner.ts`
- add a reusable session abstraction for batch runs
- update `packages/cli/src/testRunner.ts` to prepare one session and execute all specs against it
- preserve per-spec recording and report artifacts
- keep the existing single-spec `runGoal()` entrypoint working
- add tests for session reuse, cleanup, and failure behavior

## Non-Goals

- parallel spec execution
- automatic app-state reset between specs
- changing user-facing selector syntax
- changing report structure or recording filenames
- introducing a new long-lived daemon or device reservation service
