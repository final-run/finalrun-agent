# Tasks

## 1. Planning Workflow

- [x] 1.1 Update `finalruntestspec/src/commands/propose.ts` so a campaign creates only `frtestspec/changes/<campaign>/test-plan.md` and no longer creates `prompt.txt` or `ui-tests/`.
- [x] 1.2 Redesign `test-plan.md` so it includes proposal-style sections such as `## Why`, `## What Changes`, `## Capabilities`, and `## Impact`, plus testing-specific sections for existing coverage, requested outputs, scenarios, explicit file impact, and approval state in a parseable structure.
- [x] 1.3 Implement workspace inspection so proposal generation looks at relevant files in `.finalrun/tests/` and `.finalrun/testsuite/`, using name matches first and file content checks second, before deciding whether to add new tests, update existing tests, or extend an existing suite.
- [x] 1.4 Implement planning-context resolution so proposal generation uses relevant specs when available, otherwise relevant codebase files, and records any user-provided files or data it referenced.

## 2. Approval And Generation

- [x] 2.1 Add approval gating so `generate` refuses to write runnable artifacts until the campaign plan is explicitly approved.
- [x] 2.2 Update `finalruntestspec/src/commands/generate.ts` so approved test specs are written within `.finalrun/tests/` instead of `frtestspec/changes/<campaign>/ui-tests/`.
- [x] 2.3 Define the testsuite artifact shape and naming convention used under `.finalrun/testsuite/`, then wire generation to emit it when the approved plan requests a testsuite.
- [x] 2.4 Make generation respect the approved output request and emit tests, testsuite artifacts, or both without writing runnable YAML into `frtestspec/changes/`.
- [x] 2.5 Make generation update existing approved target files when the plan marks them as impacted existing assets, while creating new files for newly approved coverage.

## 3. Validation And Documentation

- [x] 3.1 Update `finalruntestspec/src/commands/validate.ts` so campaign validation resolves generated outputs from `.finalrun/tests/` and `.finalrun/testsuite/`.
- [x] 3.2 Refresh `finalruntestspec/README.md` and CLI messaging to document the planning-only campaign directory, context-aware planning step, approval workflow, and FinalRun workspace output paths.
- [x] 3.3 Add or update tests covering plan creation, context fallback, approval gating, output placement, and validation against the new workspace directories.
