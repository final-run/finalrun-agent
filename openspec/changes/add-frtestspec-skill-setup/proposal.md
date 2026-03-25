# Add frtestspec Skill Setup

## Why

`finalruntestspec` currently feels like a raw CLI utility. That makes it awkward to use from IDE-native agent workflows, and it pushes users toward direct `node ./bin/frtestspec.js` commands instead of the skill-driven experience they already get from OpenSpec.

## What Changes

- add a setup workflow that installs `finalruntestspec` skills into supported AI tool directories, starting with Codex-compatible project-local skills
- add a refresh workflow so installed skills can be regenerated after `finalruntestspec` changes, similar to how OpenSpec keeps workflow instructions current
- define generated skill content for the planning and generation flow so users can ask their IDE agent to propose, generate, and validate FinalRun artifacts without manually invoking the CLI entrypoint
- update operator guidance and README examples to prefer skill-based usage in a repo while keeping the CLI available as the backend engine

## Capabilities

### New Capabilities

- `ide-skill-installation`: install and refresh repo-local `finalruntestspec` skills for supported AI tools so the workflow is available directly inside the user’s coding assistant
- `ai-credential-resolution`: resolve Gemini credentials from supported configuration sources and provide actionable setup errors when planning or generation needs AI access

### Modified Capabilities

- None.

## Impact

- `finalruntestspec/src/index.ts`
- `finalruntestspec/src/commands/`
- `finalruntestspec/src/lib/`
- `finalruntestspec/README.md`
- generated tool-facing skill files under project-local directories such as `.codex/skills/`
- developer workflow for repositories that want to use `finalruntestspec` from an IDE rather than a direct CLI path
