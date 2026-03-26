# Tasks

- [x] Refactor `packages/cli/src/reportTemplate.ts` so the run-wide `Inputs` section becomes `Run Context`.
- [x] Remove the always-visible `Authored Spec` and `Effective Goal` cards from the default spec detail grid.
- [x] Keep the rest of the spec workspace focused on recording, screenshot, action, reasoning, analysis, trace, meta, and raw step artifacts.
- [x] Keep step-selection behavior focused on step evidence only, and confirm it no longer depends on any authored/effective input cards.
- [x] Update report-related tests in `packages/cli/src` to match the new disclosure model and preserve manifest compatibility.
- [x] Update README wording if the report walkthrough or screenshots mention the old inline `Authored Spec` and `Effective Goal` cards.
