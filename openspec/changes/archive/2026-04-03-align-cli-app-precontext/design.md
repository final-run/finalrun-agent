## Context

The CLI already has most of the plumbing needed to support session-scoped app context, but the pieces are disconnected:

- `runTests(...)` creates one shared `GoalSession` and reuses it across all selected specs.
- `prepareGoalSession(...)` installs an explicit `--app` override once after driver connection.
- `AIAgent.plan(...)` and the planner prompt already support `preContext` and `appKnowledge`.
- `HeadlessGoalExecutor` does not pass either field today.
- The only app data recorded in CLI runs is report metadata such as `"repo app"` or the override file name, which is not enough to guide planner behavior.

The runtime should solve this at the session layer, not inside the launch grounder. It should auto-launch the configured app before the AI goal loop, store the launch summary on session state, and pass that summary into planner `pre_context`. The launch action still exists for explicit restarts or cross-app flows, but the planner starts from a known app-under-test state.

The TypeScript repo has two extra constraints:

- There is no existing structured workspace app model or upload metadata source for repo-local runs.
- CLI app overrides are currently file-path based, and install methods only return success/failure instead of a resolved package name or bundle identifier.

## Goals / Non-Goals

**Goals:**

- Introduce a run-scoped primary app context that survives across the shared CLI `GoalSession`.
- Pre-launch the primary app once before the first AI goal when the run can resolve app identity safely.
- Pass launch summary as planner `preContext` and optional app knowledge as planner `appKnowledge`.
- Preserve explicit `launch_app` behavior for tests that intentionally request restart, clean state, or permission changes.
- Align default relaunch semantics for a known device-installed primary app with the bootstrap flow by avoiding uninstall-and-reinstall unless explicitly requested.
- Record the resolved primary app identity in run artifacts for debugging and report clarity.

**Non-Goals:**

- Introduce a full multi-app orchestration system for YAML tests.
- Change YAML `setup:` into a separately executed setup phase.
- Add a UI/editor app registry.
- Make primary app context mandatory for all runs. Runs without a resolvable primary app should continue to work as they do now.

## Decisions

### 1. Store primary app context at the CLI session layer

The CLI will add a run-scoped `PrimaryAppContext` object that is created before goal execution and reused across specs in the shared `GoalSession`.

The context should contain at least:

- `source`: repo or override
- `label`: human-readable app label for reporting
- `platform`
- `appPath` when the source is `--app`
- `packageName` or bundle identifier once resolved
- `appKnowledge` when available
- `launchSummary` after a successful pre-launch
- `hasPrelaunched` to avoid duplicate bootstrap launches

Why this approach:

- It keeps state on the shared session, which is where test-run execution context already lives.
- It avoids pushing CLI-specific lifecycle concerns into `HeadlessActionExecutor`, which should remain action-focused.
- It fits the existing TS architecture because `runTests(...)` already reuses one `GoalSession` across specs.

Alternatives considered:

- Store app context only inside `HeadlessGoalExecutor`.
  - Rejected because the executor is recreated for each goal, so cross-spec memory would be lost.
- Encode app context only in report metadata.
  - Rejected because reports are write-only for this purpose; planner input needs structured runtime state.

### 2. Pre-launch before the first goal, not inside the planner loop

The CLI will bootstrap-launch the primary app before the first spec's AI goal begins. The resulting device response message becomes `launchSummary`, which is then fed into planner `preContext` for that and subsequent goals in the shared session.

Why this approach:

- It keeps execution order explicit and predictable.
- It gives the planner a truthful description of actions already performed before iteration 1.
- It reduces redundant launch decisions for common "open the app" phrasing without removing the ability to relaunch explicitly later.

Alternatives considered:

- Keep launch entirely inside natural-language planning.
  - Rejected because that is the current behavior and is exactly what creates ambiguity and redundant work.
- Convert YAML `setup:` items into imperative pre-goal actions.
  - Rejected because that changes the test authoring model and expands scope beyond app bootstrap.

### 3. Pass `preContext` and `appKnowledge` through `GoalRunnerConfig` / `GoalExecutorConfig`

The existing planner fields will be wired end-to-end rather than introducing a second planning interface. `executeGoalOnSession(...)` will receive optional planner context from the run/session layer and forward it into `HeadlessGoalExecutor`, which will pass it to `AIAgent.plan(...)`.

Why this approach:

- The prompt and agent API already support these fields.
- The change stays additive and low-risk for runs that do not resolve a primary app context.
- It keeps planner-facing context explicit instead of making the executor reach back into CLI internals.

Alternatives considered:

- Reconstruct pre-context from prior step history inside the executor.
  - Rejected because a bootstrap launch happens before goal iteration history starts.

### 4. Treat primary-app relaunches as device-app launches, not reinstall workflows

When the planner later emits `launch_app` for the already-known primary app and does not explicitly request reinstall semantics, the runtime should default `shouldUninstallBeforeLaunch` to `false`, matching the new device-app bootstrap flow.

Why this approach:

- The app is already installed during CLI bootstrap setup.
- Reinstall-by-default increases run time and introduces extra failure modes.
- It better matches user intent for steps like "open the app again" or "return to the app."

Alternatives considered:

- Keep the current TypeScript default of uninstall-before-launch.
  - Rejected because it is optimized for generic app-launch grounding, not known primary app reuse.

### 5. Scope primary app resolution around explicit inputs first

This change should resolve primary app context from explicit run inputs first, with `--app` as the initial supported source. The design will not require a new workspace schema to ship the pre-context behavior, but it should keep room for a future config-backed repo-app source.

Why this approach:

- It addresses the current CLI gap with the least user-facing model churn.
- It keeps the first version grounded in the path users already pass today.
- It leaves room to add repo-level app knowledge/config later without reworking executor contracts.

Alternatives considered:

- Add a mandatory `.finalrun/config.yaml` primary app block in the same change.
  - Rejected for now because it expands scope into config design and migration.

## Risks / Trade-offs

- [Android override identity is harder to resolve than iOS `.app` metadata] → Keep the primary-app context pipeline additive, validate early, and isolate package-resolution strategy behind a dedicated resolver so the implementation can evolve without changing executor contracts.
- [Pre-launch can hide tests that intentionally expect to start outside the app] → Only perform bootstrap launch when the run has explicit primary-app context, and preserve explicit `launch_app` behavior for restart/clean-state requests.
- [Shared session reuse can leak app state between specs] → Pre-launch only once per shared session and rely on explicit launch requests for tests that need fresh state.
- [Optional app knowledge may not have a source in the first implementation] → Keep `appKnowledge` nullable and wire the field now without forcing a new authoring surface.
- [Reporting and runtime state can diverge] → Write the same resolved primary-app context object into run inputs and use it as the single source of truth for planner injection.
