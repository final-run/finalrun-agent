# Spec: AI Tools Support

## ADDED Requirements

### Requirement: Supported Tools Expansion
The `frtestspec init` command SHALL support initializing project-local skills for Claude Code, Cursor, and GitHub Copilot in addition to the existing tools (Codex, Antigravity, OpenCode).

#### Scenario: Initialize Claude Code skills
- **WHEN** Running `frtestspec init --tool claudecode`
- **THEN** Skills are written to `.claude/skills/`

#### Scenario: Initialize Cursor skills
- **WHEN** Running `frtestspec init --tool cursor`
- **THEN** Skills are written to `.cursor/skills/`

#### Scenario: Initialize Copilot skills
- **WHEN** Running `frtestspec init --tool copilot`
- **THEN** Skills are written to `.github/copilot/skills/`

#### Scenario: Initialize all tools
- **WHEN** Running `frtestspec init --tool all`
- **THEN** Skills are written for all 6 supported tools (codex, antigravity, opencode, claudecode, cursor, copilot)
