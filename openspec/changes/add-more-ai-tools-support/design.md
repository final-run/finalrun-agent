# Design: AI Tools Support Expansion

## Context
The `frtestspec` CLI currenty supports a limited set of AI tools (Codex, Antigravity, OpenCode). To improve reach, we need to add support for other popular tools like Claude Code, Cursor, and GitHub Copilot.

## Goals / Non-Goals

**Goals:**
- Include `claudecode`, `cursor`, and `copilot` as first-class citizens in `frtestspec init`.
- Map each tool to its standard skills/instructions directory.
- Ensure the CLI help and interactive prompts correctly reflect these options.
- Maintain parity in skill generation across all supported tools.

**Non-Goals:**
- Implement tool-specific skill logic beyond path mapping.
- Change the core `ManagedSkillDefinition`.

## Decisions

- **Enum expansion**: Add `claudecode`, `cursor`, and `copilot` to the `SupportedTool` zod enum in `project-config.ts`.
- **Directory Mappings**:
  - `claudecode` -> `.claude/skills` (standard for Claude Code project-local skills)
  - `cursor` -> `.cursor/skills` (standard for Cursor rules/skills)
  - `copilot` -> `.github/copilot/skills` (standard for GitHub Copilot workspace customizations)
- **CLI Options**: Update the `init` command description and `--tool` help text to list the new tools.

## Risks / Trade-offs

- **Directory proliferation**: Each tool creates its own hidden directory if not careful. However, this is expected behavior for per-tool skill management.
- **Naming conflicts**: Using `claudecode` instead of `claude` to be explicit about the CLI tool.
