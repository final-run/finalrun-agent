## ADDED Requirements

### Requirement: Generated Codex planning skill SHALL use plan naming

Generated Codex skills SHALL use `plan` terminology for the planning workflow.

#### Scenario: Init generates frtestspec-plan

- **WHEN** the operator runs `frtestspec init --tool codex`
- **THEN** the system SHALL create `.codex/skills/frtestspec-plan/SKILL.md`
- **AND** the system SHALL NOT create `.codex/skills/frtestspec-propose/SKILL.md`

#### Scenario: Generated skill invokes the plan command

- **WHEN** the system renders the managed planning skill
- **THEN** the skill SHALL instruct the assistant to run `frtestspec plan ...`
- **AND** the skill SHALL continue to describe the same planning artifact and approval workflow

### Requirement: Skill refresh SHALL converge repositories on plan naming

Managed skill refresh SHALL remove outdated planning skill names that still use `propose`.

#### Scenario: Update removes the old planning skill directory

- **WHEN** `.codex/skills/frtestspec-propose/` exists from an older setup
- **AND** the operator runs `frtestspec update`
- **THEN** the system SHALL remove the old `frtestspec-propose` managed skill directory
- **AND** the refreshed repository SHALL contain `.codex/skills/frtestspec-plan/SKILL.md`
