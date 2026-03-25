# Proposal: Add support for more AI tools (Claude Code, Cursor, Copilot)

## Why

The `frtestspec init` command currently supports only Codex, Antigravity, and OpenCode. As the tool expands, it should support more popular AI coding assistants like Claude Code, Cursor, and GitHub Copilot to enable developers to use FinalRun test generation within their preferred environments.

## What Changes

- Update `SupportedTool` enum to include `claudecode`, `cursor`, and `copilot`.
- Map these new tools to their respective skills directories.
- Update the `init` command CLI options and interactive prompts to include the new tools.
- Add automated tests to verify skill creation for the new tools.

## Capabilities

### New Capabilities
- `ai-tools-support`: Support for Claude Code, Cursor, and GitHub Copilot in `frtestspec init`.

### Modified Capabilities
- `init-command`: Updated to handle a broader range of AI tools.

## Impact

- `src/lib/project-config.ts`: `SupportedTool` enum updated.
- `src/lib/workspace.ts`: `TOOL_SKILLS_DIRS` updated with new mappings.
- `src/commands/init.ts`: CLI help and prompts updated.
- `test/workflow.test.mjs`: New tests for tool-specific skill installation.
