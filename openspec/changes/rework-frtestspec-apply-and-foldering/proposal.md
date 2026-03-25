# Rework frtestspec Apply And Foldering

## Why

`finalruntestspec` still uses `generate` as the action that turns an approved plan into runnable artifacts, but that wording does not match the actual workflow. The real operation is “apply the approved plan,” and keeping the old name makes the tool feel less aligned with the approval gate it already enforces.

The current test output strategy is also too flat. New test files default to `.finalrun/tests/<feature>-<scenario>.yaml`, which makes coverage harder to browse as the workspace grows. Tests should land in feature folders when that grouping is clear, and existing feature tests should be updated in place.

## What Changes

- **BREAKING** replace the user-facing `generate` workflow with `apply`, where `apply` means “take the approved plan and create or update runnable artifacts”
- make `apply` run validation as part of the apply flow instead of treating validation as a completely separate manual step
- keep `validate` available as a standalone CLI command for re-checking artifacts after manual edits or debugging
- reduce the skill surface to the actual workflow steps by generating `frtestspec-plan` and `frtestspec-apply`, not workflow skills for setup/admin commands
- remove the dedicated `update` CLI command and make `init` idempotent so rerunning `init` refreshes managed skill files
- change test target path planning so test files are grouped into feature folders under `.finalrun/tests/` when the feature grouping is clear
- make planning prefer updating existing feature-specific tests when matching coverage already exists
- require the planning flow to surface folder uncertainty so the operator can confirm or refine the target grouping before approval when the correct folder is not obvious

## Capabilities

### New Capabilities

- `approved-plan-application`: apply approved plans into runnable FinalRun artifacts, validate the result, and present the workflow as `apply`
- `feature-foldered-test-artifacts`: place generated tests into feature-grouped folders and use explicit folder impact in the approved plan

### Modified Capabilities

- None.

## Impact

- `finalruntestspec/src/index.ts`
- `finalruntestspec/src/commands/`
- `finalruntestspec/src/lib/skills.ts`
- `finalruntestspec/src/lib/test-plan.ts`
- `finalruntestspec/README.md`
- `finalruntestspec/test/workflow.test.mjs`
- generated `.codex/skills/frtestspec-*/SKILL.md` content
- approved plan contents that currently point at flat test paths under `.finalrun/tests/`
