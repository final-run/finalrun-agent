# Tasks

- [x] Refactor `packages/cli/src/goalRunner.ts` to separate device-session preparation, per-spec execution, and cleanup.
- [x] Add a reusable goal-session abstraction that holds the prepared `DeviceNode`, selected device, and platform state.
- [x] Update `packages/cli/src/testRunner.ts` to prepare one shared session per batch and execute all selected specs against it.
- [x] Keep per-spec recording start/stop logic inside the per-spec execution path.
- [x] Keep `runGoal()` working as the isolated single-spec wrapper over the new lower-level helpers.
- [x] Add or update `goalRunner` tests for session preparation, cleanup, and per-spec recording behavior.
- [x] Add or update `testRunner` tests to verify one setup/cleanup per batch and correct stop-on-session-failure behavior.
- [x] Run the relevant test suites after implementation and fix any regressions.
