## ADDED Requirements

### Requirement: Approved plans SHALL be executed through apply

The system SHALL expose the approved-plan execution workflow through `apply` rather than `generate`.

#### Scenario: Apply writes approved artifacts

- **WHEN** the operator runs `frtestspec apply <campaign-name>`
- **THEN** the system SHALL load the approved plan for that campaign
- **AND** it SHALL create or update the approved runnable artifacts under `.finalrun/tests/` and `.finalrun/testsuite/`

#### Scenario: Unapproved plan blocks apply

- **WHEN** the operator runs `frtestspec apply <campaign-name>` for a plan whose `approval.status` is not `approved`
- **THEN** the system SHALL refuse to write runnable artifacts
- **AND** it SHALL instruct the operator to review and approve the plan first

### Requirement: Apply SHALL validate written artifacts before succeeding

The system SHALL validate the artifacts it writes during `apply`.

#### Scenario: Apply succeeds only after validation

- **WHEN** the system finishes writing all approved artifact files during `apply`
- **THEN** it SHALL run the same structural validation rules used by the standalone `validate` command
- **AND** `apply` SHALL report success only if that validation passes

#### Scenario: Validation failure causes apply failure

- **WHEN** written artifacts fail validation during `apply`
- **THEN** `apply` SHALL fail
- **AND** it SHALL surface the validation error details to the operator

### Requirement: Validate SHALL remain available as a standalone CLI utility

The system SHALL keep `validate` as a separate CLI command even though `apply` runs validation internally.

#### Scenario: Operator validates after manual edits

- **WHEN** the operator manually edits generated artifacts after apply
- **THEN** they SHALL be able to run `frtestspec validate <campaign-name>` without reapplying the plan

### Requirement: Setup/admin commands SHALL stay out of workflow skills

Managed workflow skills SHALL only expose the main plan/apply path.

#### Scenario: Generated skills focus on workflow actions

- **WHEN** the operator runs `frtestspec init --tool codex`
- **THEN** the system SHALL generate `frtestspec-plan` and `frtestspec-apply` skills
- **AND** it SHALL NOT generate workflow skills for `validate` or setup/admin commands

### Requirement: Skill refresh SHALL be handled by init

The system SHALL use `init` as the refresh mechanism for managed skill files.

#### Scenario: Rerunning init refreshes managed skills

- **WHEN** `frtestspec/config.yaml` and managed skills already exist
- **AND** the operator reruns `frtestspec init --tool codex`
- **THEN** the system SHALL refresh the managed skill files
- **AND** it SHALL preserve the configured backend command unless the operator supplies a new one
