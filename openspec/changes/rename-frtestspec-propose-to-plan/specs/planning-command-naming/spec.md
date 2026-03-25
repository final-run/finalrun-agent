## ADDED Requirements

### Requirement: CLI planning command SHALL be named plan

The system SHALL expose the planning workflow through a `plan` command instead of `propose`.

#### Scenario: Plan creates the planning artifact

- **WHEN** the operator runs `frtestspec plan <campaign-name> [request...]`
- **THEN** the system SHALL create `frtestspec/changes/<campaign-name>/test-plan.md`
- **AND** the rest of the planning behavior SHALL match the existing planning workflow

#### Scenario: CLI help shows plan

- **WHEN** the operator requests CLI help
- **THEN** the help output SHALL list `plan` as the planning command
- **AND** it SHALL NOT list `propose` as a supported planning command

### Requirement: Planning implementation naming SHALL match the command surface

The source implementation for the planning workflow SHALL use `plan` naming rather than `propose` naming.

#### Scenario: Planning module matches public command

- **WHEN** a developer inspects the command implementation
- **THEN** the planning command module SHALL be named `plan.ts`
- **AND** the exported registration and runtime helpers SHALL use `plan` terminology
