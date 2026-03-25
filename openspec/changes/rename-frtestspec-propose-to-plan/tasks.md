# Tasks

## 1. CLI Rename

- [x] 1.1 Rename `finalruntestspec/src/commands/propose.ts` to `finalruntestspec/src/commands/plan.ts` and update exported helper names from `propose` to `plan`.
- [x] 1.2 Update `finalruntestspec/src/index.ts` so the CLI registers `plan` instead of `propose`.
- [x] 1.3 Refresh user-facing planning command text in command output and help strings so they consistently say `plan`.

## 2. Skill Rename

- [x] 2.1 Update managed skill generation in `finalruntestspec/src/lib/skills.ts` so the planning skill is named `frtestspec-plan` and runs `frtestspec plan ...`.
- [x] 2.2 Make managed skill refresh remove the old `frtestspec-propose` directory when regenerating Codex skills.
- [x] 2.3 Update setup guidance so it tells users to use `frtestspec-plan` instead of `frtestspec-propose`.

## 3. Docs And Verification

- [x] 3.1 Refresh `finalruntestspec/README.md` examples and command reference to use `plan`.
- [x] 3.2 Update tests in `finalruntestspec/test/workflow.test.mjs` to exercise `plan` naming in the CLI and generated skills.
