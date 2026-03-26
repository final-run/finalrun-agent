# Tasks

- [x] Extend `packages/common/src/models/RunArtifacts.ts` with render-ready manifest/index types, failure-phase metadata, and path-rich records for run/spec/step views.
- [x] Add CLI helpers to snapshot selected YAML specs and safe environment metadata into each run bundle without persisting resolved secret values.
- [x] Refactor `packages/cli/src/reportWriter.ts` so it writes input snapshots, existing raw artifacts, `run.json`, and backward-compatible `summary.json`.
- [x] Add a root index builder in `packages/cli/src` that scans available `run.json` files and regenerates `.finalrun/artifacts/runs.json`.
- [x] Split HTML rendering into a single-run template driven only by `run.json` and a run-list template driven only by `runs.json`.
- [x] Update `packages/cli/src/testRunner.ts` and failure-artifact paths so run manifests include selectors, provider/model, requested platform, app override, and validation/setup/execution failure phase.
- [x] Add CLI read surfaces in `packages/cli/bin/finalrun.ts` for `finalrun runs [--json]` and a small static report server command.
- [x] Update terminal output and README examples so users can find both the per-run report and the root run-history page.
- [x] Add or update tests for manifest writing, snapshot redaction, root index rebuilding, run-list/detail HTML generation, failure-phase runs, and the new CLI commands.
- [x] Run the relevant `packages/cli`, `packages/common`, and integration-oriented test suites after implementation and fix regressions.
