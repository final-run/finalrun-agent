# local-report-server Specification

## Purpose
TBD - created by archiving change add-local-report-server. Update Purpose after archive.
## Requirements
### Requirement: Workspace-scoped report server can be started from the CLI
The system SHALL provide a `finalrun start-server` command that starts a local report server for the nearest repository containing `.finalrun`.

#### Scenario: Start server from a valid workspace
- **WHEN** the user runs `finalrun start-server` from a repository containing `.finalrun`
- **THEN** the system SHALL start or connect to a local report server for that workspace
- **AND** the CLI SHALL print the local URL for browsing report results
- **AND** the command SHALL open the browser to that URL

#### Scenario: Start server outside a FinalRun workspace
- **WHEN** the user runs `finalrun start-server` outside any repository containing `.finalrun`
- **THEN** the command SHALL fail with an actionable workspace error

### Requirement: Start-server reuses an already-running workspace server
The system MUST avoid starting duplicate report servers for the same workspace.

#### Scenario: Existing workspace server is already healthy
- **WHEN** the user runs `finalrun start-server` and a healthy report server for that workspace is already running
- **THEN** the command SHALL return the existing server URL
- **AND** the system SHALL NOT start a second server process
- **AND** the command SHALL open the browser to the existing server URL

### Requirement: Workspace server state is persisted in generated artifacts
The system SHALL persist workspace report-server state in `.finalrun/artifacts/.server.json` so the CLI can reconnect to an existing server process.

#### Scenario: Server state is written after startup
- **WHEN** the report server is started for a workspace
- **THEN** the system SHALL write server state to `.finalrun/artifacts/.server.json`
- **AND** that state SHALL be sufficient for later health checks and server reuse

### Requirement: Report UI is rendered dynamically from JSON artifacts
The report server SHALL render workspace and run views using persisted JSON artifacts rather than requiring pre-generated HTML report pages.

#### Scenario: Workspace home renders from stored run index data
- **WHEN** the user opens the workspace report home route
- **THEN** the server SHALL render the test runs list using persisted report data from the workspace artifacts

#### Scenario: Individual run view renders from run manifest data
- **WHEN** the user opens a route for a specific run
- **THEN** the server SHALL render that run using the stored `run.json` data for the selected run

#### Scenario: Static report HTML is not required
- **WHEN** a test run completes after this change is implemented
- **THEN** the report artifacts SHALL remain browsable through the local report server
- **AND** the system SHALL NOT require generated `index.html` report files for browsing results

### Requirement: Test execution integrates with an active report server
When a workspace report server is already running, completed test runs SHALL expose the dynamic route for the newly created run.

#### Scenario: Test command completes while server is active
- **WHEN** `finalrun test ...` completes successfully or unsuccessfully and a workspace report server is already running
- **THEN** the CLI SHALL print the dynamic run URL for the new run result
- **AND** the CLI SHALL open the browser to that exact run route

### Requirement: Legacy report-serve command remains compatible during migration
The existing `finalrun report serve` command SHALL continue to work during migration by delegating to the same local report server flow.

#### Scenario: Legacy serve command is used
- **WHEN** the user runs `finalrun report serve`
- **THEN** the system SHALL start or reuse the same workspace-scoped local report server used by `finalrun start-server`

