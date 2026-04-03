## Why

The TypeScript CLI currently installs `--app` overrides and then starts the AI goal loop without carrying any structured "primary app" context into planning. In the Dart repo, AI goal execution pre-launches the configured app, records a launch summary, and passes that summary plus app knowledge into the planner, which reduces redundant launch actions and gives the agent a clearer starting point.

## What Changes

- Add run-scoped primary app context for CLI goal sessions so the current run can remember which app is considered the app under test.
- Resolve a primary app identity from explicit CLI app inputs, starting with `--app`, so the run can refer to the installed app by package name or bundle identifier instead of only by file path.
- Pre-launch the primary app before the first AI goal execution when a primary app is configured, store a launch summary, and pass that summary into planner `pre_context`.
- Pass app-specific knowledge into the planner when primary app knowledge is available for the run.
- Align CLI launch behavior for primary device apps with the Dart flow so relaunches do not default to uninstall-and-reinstall unless the test explicitly asks for that behavior.
- Record primary app context in run artifacts so report output explains whether the run used a repo app or an explicit override and what app identity was used.

## Capabilities

### New Capabilities
- `cli-primary-app-context`: Define how CLI runs resolve, pre-launch, remember, and reuse a primary app context across AI goal execution.

### Modified Capabilities
- None.

## Impact

- Affected code: `packages/cli`, `packages/goal-executor`, and `packages/device-node`
- Potentially affected config and reporting surfaces: run manifest/report metadata and CLI app override handling
- Behavioral impact: AI goals can begin with a known launched app and planner pre-context instead of inferring everything from natural-language steps alone
