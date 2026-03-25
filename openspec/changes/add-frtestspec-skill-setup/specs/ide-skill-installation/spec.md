## ADDED Requirements

### Requirement: Repository can initialize Codex skill support

The system SHALL provide an initialization command that configures repo-local Codex skills for `finalruntestspec`.

#### Scenario: Init creates config and Codex skills

- **WHEN** the operator runs `frtestspec init --tool codex` from a repository root
- **THEN** the system SHALL create `frtestspec/config.yaml` if it does not already exist
- **AND** the config SHALL record the selected tool as `codex`
- **AND** the system SHALL create managed skill files under `.codex/skills/`
- **AND** those skills SHALL cover the `propose`, `generate`, and `validate` workflows

#### Scenario: Init captures a custom backend invocation

- **WHEN** the operator runs `frtestspec init --tool codex --command "node /absolute/path/to/bin/frtestspec.js"`
- **THEN** the system SHALL persist that command string in `frtestspec/config.yaml`
- **AND** generated skill files SHALL instruct the assistant to use that configured command for workflow execution

### Requirement: Repository can refresh managed Codex skills

The system SHALL provide an update command that regenerates managed Codex skills from the saved project configuration.

#### Scenario: Update refreshes existing skills

- **WHEN** `frtestspec/config.yaml` exists with `tool: codex`
- **AND** the operator runs `frtestspec update`
- **THEN** the system SHALL rewrite the managed `.codex/skills/` files from the current templates
- **AND** the system SHALL preserve the configured backend command from `frtestspec/config.yaml`
- **AND** the system SHALL report which managed files were refreshed

#### Scenario: Update requires project configuration

- **WHEN** the operator runs `frtestspec update` in a repository without `frtestspec/config.yaml`
- **THEN** the system SHALL fail with guidance to run `frtestspec init --tool codex` first

### Requirement: Generated skills describe the FinalRun workflow

Generated Codex skills SHALL describe the plan-first FinalRun workflow and the workspace locations used by `finalruntestspec`.

#### Scenario: Skill content points to planning and output locations

- **WHEN** the system generates a `propose` skill for Codex
- **THEN** the skill SHALL instruct the assistant that planning artifacts live under `frtestspec/changes/`
- **AND** the skill SHALL describe that generated tests are written under `.finalrun/tests/`
- **AND** the skill SHALL describe that generated testsuites are written under `.finalrun/testsuite/`
- **AND** the skill SHALL state that plan approval must be represented in `test-plan.md` before generation
