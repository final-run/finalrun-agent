# Rename frtestspec Propose To Plan

## Why

`propose` is the wrong word for `finalruntestspec`'s planning step. The command is generating a test plan, not opening a broader proposal workflow, so the current name feels heavier and less natural than the actual job it performs.

That mismatch now leaks into the CLI, the generated Codex skills, and the docs. Renaming the workflow to `plan` will make the tool easier to explain and more consistent with the test-plan artifact it already creates.

## What Changes

- **BREAKING** rename the CLI planning command from `propose` to `plan`
- rename the planning command module from `propose.ts` to `plan.ts` so the code matches the user-facing workflow
- update CLI help text, progress messages, and README examples to use `plan`
- **BREAKING** rename the generated Codex skill from `frtestspec-propose` to `frtestspec-plan`
- regenerate managed skill content so it tells the assistant to run `frtestspec plan ...` instead of `frtestspec propose ...`
- keep the planning artifact shape and approval flow unchanged; this change is about naming, not behavior

## Capabilities

### New Capabilities

- `planning-command-naming`: expose the FinalRun planning workflow as `plan` across the CLI and generated guidance
- `skill-command-naming`: align generated Codex skill names and instructions with the `plan` terminology

### Modified Capabilities

- None.

## Impact

- `finalruntestspec/src/index.ts`
- `finalruntestspec/src/commands/`
- `finalruntestspec/src/lib/skills.ts`
- `finalruntestspec/README.md`
- `finalruntestspec/test/workflow.test.mjs`
- generated `.codex/skills/frtestspec-*/SKILL.md` content
- operator workflow for planning campaigns from the CLI or from Codex
