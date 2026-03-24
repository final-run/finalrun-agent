# Simplify Run Report Input Disclosure

## Why

`add-run-manifests-and-report-index` correctly preserved authored spec input and effective goal data in `run.json`, but the first HTML presentation is too aggressive.

Today the single-run report:

- shows a run-wide `Inputs` section
- also shows `Authored Spec` and `Effective Goal` as always-visible cards inside every spec detail view
- keeps those spec-level input blocks on screen while the user is trying to inspect screenshots, recordings, reasoning, failures, and step traces

This creates avoidable noise in the main debugging surface. Most users need step evidence first. The authored YAML and compiled goal are useful as stored artifacts, but they do not need first-class space in the default report UI.

## Proposed Change

Simplify the single-run report so the HTML stops rendering authored spec content and effective goal content inline.

The implementation should:

- keep `run.json`, YAML snapshots, parsed spec JSON, and `effectiveGoal` in the artifact model
- rename the current run-wide `Inputs` section to `Run Context` so it is clearly run-scoped
- remove the always-visible `Authored Spec` and `Effective Goal` cards from the default spec detail grid
- avoid replacing those cards with another disclosure-heavy UI surface in this follow-up
- keep access to authored input through the existing snapshot files and raw artifacts rather than rendering that content directly into the main page
- keep step inspection focused on screenshots, video, action, reasoning, analysis, trace, and raw step artifacts

## Scope

- single-run HTML rendering changes in `packages/cli/src/reportTemplate.ts`
- minor UI wording adjustments in the report header/index
- test updates for the simplified report surface
- small README wording update if the report walkthrough mentions the old inline cards

## Non-Goals

- removing authored spec or effective goal data from `run.json`
- changing the `runs.json` run-list contract
- changing artifact storage paths for YAML snapshots, parsed spec JSON, recordings, or screenshots
- adding a new modal, drawer, or tabbed input-inspection UI
- redesigning the whole report layout beyond the input-disclosure problem
