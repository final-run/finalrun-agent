## ADDED Requirements

### Requirement: CLI run resolves a primary app context for explicit app inputs

When a CLI run includes an explicit primary app input, the system SHALL resolve a run-scoped primary app context that includes the platform, user-facing label, source, and a launchable app identifier such as package name or bundle identifier.

#### Scenario: App override resolves primary app identity

- **WHEN** a user runs `finalrun test` or `finalrun suite` with `--app <path>`
- **AND** the CLI successfully validates and installs that override
- **THEN** the run SHALL store a primary app context for the shared goal session
- **AND** that context SHALL include the resolved app identifier needed to launch the installed app again without relying on the override file path

#### Scenario: No explicit app input leaves primary app context unset

- **WHEN** a CLI run starts without an explicit primary app input
- **THEN** the system SHALL leave primary app context unset
- **AND** it SHALL preserve existing goal-execution behavior without bootstrap app launch

### Requirement: CLI bootstrap-launches the primary app before the first AI goal

When a shared goal session has a resolved primary app context, the CLI SHALL launch that app before the first AI goal begins and SHALL remember the successful launch summary for later planner calls.

#### Scenario: First goal in a run receives bootstrap launch

- **WHEN** the first selected spec begins execution in a shared goal session
- **AND** that session has a resolved primary app context
- **THEN** the CLI SHALL launch the primary app before starting goal iteration 1
- **AND** it SHALL store the successful launch result as launch summary on the shared session context

#### Scenario: Subsequent specs do not repeat bootstrap launch

- **WHEN** a later spec starts in the same shared goal session
- **AND** the session already recorded a successful bootstrap launch for the same primary app
- **THEN** the CLI SHALL NOT perform a duplicate bootstrap launch automatically

### Requirement: Planner receives primary app pre-context and optional app knowledge

The goal planner SHALL receive primary app launch summary as `pre_context` and SHALL receive app knowledge when the run provides it.

#### Scenario: Launch summary is passed to planner

- **WHEN** a goal starts after the CLI successfully bootstrap-launched the primary app
- **THEN** the planner request SHALL include `pre_context`
- **AND** that `pre_context` SHALL describe the successful pre-goal app launch

#### Scenario: App knowledge is passed when available

- **WHEN** the run-scoped primary app context includes app knowledge text
- **THEN** the planner request SHALL include that text as `app_knowledge`

### Requirement: Known primary app relaunch does not default to reinstall

When the runtime relaunches a known primary app that is already installed on the device, the relaunch path SHALL NOT default to uninstall-and-reinstall unless the test explicitly requests reinstall semantics.

#### Scenario: Relaunch without explicit reinstall request

- **WHEN** the planner emits `launch_app` for the known primary app
- **AND** the request does not explicitly ask for reinstall behavior
- **THEN** the resulting launch action SHALL default `shouldUninstallBeforeLaunch` to false

#### Scenario: Explicit reinstall request still wins

- **WHEN** the planner or test explicitly requests reinstall behavior for a primary app launch
- **THEN** the runtime SHALL preserve that explicit uninstall-before-launch request

### Requirement: Run artifacts record resolved primary app context

The CLI SHALL write the resolved primary app context into run inputs so reports can explain what app the run treated as the primary app under test.

#### Scenario: Override-backed run records resolved app identity

- **WHEN** a run uses an explicit `--app` override and resolves a primary app context
- **THEN** the run inputs artifact SHALL record that the app source was an override
- **AND** it SHALL record the resolved app identifier used for primary-app launch behavior
