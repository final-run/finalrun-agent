# Add Render-Ready Run Manifests And Report Index

## Why

FinalRun already writes useful per-run artifacts, but the current artifact model is still report-writer-oriented rather than renderer-oriented.

Today:

- each run gets a local `summary.json`, `index.html`, `runner.log`, and per-spec result tree
- the single-run HTML report is generated directly from in-memory `summary + specs` data during `reportWriter.finalize(...)`
- there is no top-level run history page or canonical `runs.json` for browsing multiple runs
- authored inputs such as the YAML snapshot, safe environment config, and effective prompt are not preserved as first-class run data

This creates three product problems:

- a web page or static server cannot render a useful run list without directory scanning and ad hoc JSON reads
- a historical run cannot reliably explain "what the user asked for" versus "what the runner executed"
- future report UI work is harder because HTML generation depends on multiple raw files instead of a single render-ready manifest

## Proposed Change

Introduce render-ready manifests for both report surfaces:

- one `run.json` per run as the single source of truth for the run detail page
- one root `runs.json` as the single source of truth for the run history page

The implementation should:

- snapshot authored inputs into each run bundle, including selected YAML specs and safe environment metadata
- preserve paths for screenshots, recordings, logs, raw JSON artifacts, and YAML snapshots as relative links
- keep existing raw artifacts such as `summary.json`, `result.json`, and step JSON files for drill-down and backward compatibility
- generate a root `.finalrun/artifacts/index.html` that lists runs and links into per-run reports
- update the per-run report to render entirely from `run.json`
- add CLI entry points for run-history access, with `finalrun runs [--json]` as the minimum surface and a small static report server as a convenience layer

## Scope

- artifact schema changes in `packages/common`
- report writing and manifest generation in `packages/cli`
- root run-index generation and HTML templates for both list and detail views
- `finalrun test` flow changes so manifests include run context, input snapshots, and failure-phase metadata
- CLI additions for listing and serving reports
- tests and README updates

## Non-Goals

- introducing a database or remote backend
- storing resolved secret values in artifacts
- replacing raw step/result artifacts with only aggregated manifests
- redesigning goal execution, model prompts, or device orchestration
- building a live dashboard with websockets or server-side persistence
