# update-command Specification

## Purpose
This specification defines the functional requirements for the `update` command in the `finalruntestspec` CLI, which allows users to maintain and refresh their project configuration and AI tool skills.

## Requirements
### Requirement: Update Command Configuration
The `update` command MUST allow users to modify existing project configuration (tools, scope, backend command).

#### Scenario: Updating tools via CLI flag
- **WHEN** the user runs `frtestspec update --tool codex,antigravity` in an initialized project
- **THEN** it should update `frtestspec/config.yaml` with these tools and refresh the skills.

### Requirement: Init Command Guard
The `init` command MUST NOT overwrite an existing configuration and MUST advise the user to use `update` instead.

#### Scenario: Running init on an existing project
- **WHEN** the user runs `frtestspec init` in a directory that already contains `frtestspec/config.yaml`
- **THEN** it should fail with a helpful error message.
