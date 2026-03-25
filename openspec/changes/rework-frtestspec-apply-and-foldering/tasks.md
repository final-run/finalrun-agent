# Tasks

## 1. Apply Workflow

- [ ] 1.1 Rename the approved-plan execution command from `generate` to `apply` across `finalruntestspec/src/commands/`, CLI registration, and operator-facing help text.
- [ ] 1.2 Make `apply` reuse the current generation logic and then run validation automatically before reporting success.
- [ ] 1.3 Keep `validate` as a standalone CLI command and update its messaging to reflect that it is optional for re-checking after apply.

## 2. Skills And Setup Surface

- [ ] 2.1 Update managed skill generation in `finalruntestspec/src/lib/skills.ts` so the workflow skills are `frtestspec-plan` and `frtestspec-apply`.
- [ ] 2.2 Remove the separate `update` command and make `finalruntestspec/src/commands/init.ts` refresh existing managed skills and config when rerun.
- [ ] 2.3 Update setup/admin guidance so `init` is the only refresh path and workflow messaging no longer points users to `generate`, `update`, or a `validate` skill.

## 3. Feature Foldering

- [ ] 3.1 Update test path planning in `finalruntestspec/src/lib/test-plan.ts` and related planning code so new tests default to `.finalrun/tests/<feature-folder>/...` when the feature grouping is clear.
- [ ] 3.2 Make planning prefer existing feature-specific test paths when updating relevant coverage.
- [ ] 3.3 Surface folder ambiguity explicitly in the plan output so operators can resolve it before approval instead of silently accepting a weak guess.
- [ ] 3.4 Update apply-time generation and testsuite references so approved foldered test paths are preserved exactly.

## 4. Docs And Verification

- [ ] 4.1 Refresh `finalruntestspec/README.md` to describe the `plan` -> `apply` workflow, idempotent `init`, and feature-foldered test outputs.
- [ ] 4.2 Add or update tests in `finalruntestspec/test/workflow.test.mjs` for the `apply` command, apply-triggered validation, idempotent `init`, reduced skill surface, and folder-aware target paths.
