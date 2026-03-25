# Tasks

## 1. Skill Setup Commands

- [x] 1.1 Add `init` and `update` command registration to `finalruntestspec/src/index.ts` and create command modules for Codex-focused skill setup.
- [x] 1.2 Implement project config persistence for `frtestspec/config.yaml`, including the selected tool and the configured backend command string.
- [x] 1.3 Make `frtestspec init --tool codex` create or update the project config and generate managed skill directories under `.codex/skills/`.
- [x] 1.4 Make `frtestspec update` reload `frtestspec/config.yaml`, fail cleanly when it is missing, and regenerate the managed Codex skill files from templates.

## 2. Managed Skill Content

- [x] 2.1 Add reusable skill templates for the `propose`, `generate`, and `validate` workflows that describe the FinalRun planning and workspace artifact paths.
- [x] 2.2 Ensure generated skills embed the configured backend invocation so both global `frtestspec` installs and local `node /abs/path/bin/frtestspec.js` launches are supported.
- [x] 2.3 Mark generated skill files as managed artifacts and make regeneration overwrite them deterministically.

## 4. Docs And Verification

- [x] 4.1 Refresh `finalruntestspec/README.md` to document the skill-first workflow, `init`/`update`, Codex skill paths, and Gemini credential setup options.
- [x] 4.2 Add or update tests covering config creation, skill generation, skill refresh, credential precedence, actionable missing-key failures, and the fact that `validate` remains offline.
