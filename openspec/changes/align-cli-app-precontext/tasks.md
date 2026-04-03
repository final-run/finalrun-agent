## 1. Primary App Context

- [ ] 1.1 Add a shared `PrimaryAppContext` model and thread optional planner-context fields through the CLI run/session and goal-execution configs.
- [ ] 1.2 Implement primary app resolution for explicit app inputs, including validation of a launchable app identifier for `--app`.
- [ ] 1.3 Extend run-input artifact models and report context writing to persist resolved primary app details.

## 2. Bootstrap Launch And Planner Context

- [ ] 2.1 Add a one-time bootstrap launch step for the primary app before the first AI goal in a shared session and store the successful launch summary on session context.
- [ ] 2.2 Pass `preContext` and optional `appKnowledge` from the shared run/session context into `HeadlessGoalExecutor` and `AIAgent.plan(...)`.
- [ ] 2.3 Add unit tests for no-context fallback, first-goal bootstrap launch, and reuse of launch summary across multiple specs in the same run.

## 3. Launch Semantics And Verification

- [ ] 3.1 Update known primary-app relaunch behavior so `launch_app` does not default to uninstall-and-reinstall unless explicitly requested.
- [ ] 3.2 Update report and run-manifest coverage to show resolved primary app source and identifier for override-backed runs.
- [ ] 3.3 Add end-to-end CLI tests covering override installation, primary app pre-context injection, and recorded run artifacts.
