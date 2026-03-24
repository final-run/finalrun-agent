# Tasks

- [x] Add `.finalrun/suites` support to the workspace model and path-validation helpers.
- [x] Add `RepoTestSuite` and `LoadedRepoTestSuite` models plus a suite loader that validates `name` and `tests: string[]`.
- [x] Extend `finalrun check` and `finalrun test` with `--suite <path>` and reject mixing `--suite` with positional selectors.
- [x] Resolve suite `tests` entries through the existing selector engine so ordering, glob semantics, and de-duplication match direct selector runs.
- [x] Add `input/suite.snapshot.yaml` and `input/suite.json` for suite runs while keeping `tests/<spec-id>/result.json` unchanged.
- [x] Extend the run manifest model so `run.json` stores a compact `run.target` block and an `input.suite` block for suite runs.
- [x] Extend the run index model so each `runs.json` entry stores a compact `target` block with suite name/path for suite runs.
- [x] Thread the new run-target metadata through `runCheck()`, `runTests()`, `ReportWriter`, and `runIndex.ts`.
- [x] Update `ReportWriter` to persist suite metadata into `run.json`, mirror it in `summary.json` only if useful for compatibility, and copy the suite manifest into artifacts for suite runs.
- [x] Update `runIndex.ts` and `reportIndexTemplate.ts` so the root run-history page shows suite/direct run origin and suite names for suite runs.
- [x] Update `reportTemplate.ts` so the per-run report shows suite metadata in the Run Context section and adds an explicit execution-order column in the spec index.
- [x] Add unit and CLI coverage for suite loading, suite validation errors, `--suite` resolution, selector/suite exclusivity, `input/suite.*` snapshots, `run.json`/`runs.json` suite metadata, and suite report rendering.
- [x] Update the README with `.finalrun/suites` layout, suite YAML examples, and `check --suite` / `test --suite` usage.
- [x] Run the relevant CLI test suites after implementation and fix regressions.
