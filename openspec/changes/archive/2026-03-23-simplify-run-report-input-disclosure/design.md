# Design

## Current State

The new report architecture from `add-run-manifests-and-report-index` already stores the right data:

- `run.json` preserves run-wide context, selected spec snapshots, and per-spec `effectiveGoal`
- each `RunManifestSpecRecord` already includes:
  - `snapshotYamlPath`
  - `snapshotJsonPath`
  - `authored`
  - `effectiveGoal`

The issue is presentation, not storage.

Today `packages/cli/src/reportTemplate.ts` does two separate things:

- renders a run-wide `Inputs` table for selectors, variables, secrets, and snapshot links
- also renders `Authored Spec` and `Effective Goal` as always-visible cards inside each spec's step-detail grid

That means spec-scoped authored input competes with step-scoped debugging information in the most valuable part of the page.

## Decision

Keep the artifact model as-is and simplify the renderer contract:

- run-wide inputs stay visible as a compact `Run Context` section
- spec-scoped authored input stays in artifacts, but is not rendered as first-class report content
- step selection updates only step evidence and never changes or re-renders spec input panels

This is a UI refinement on top of the existing manifest architecture, not a new artifact-storage change.

## UI Model

### Run Header And Context

Rename the current `Inputs` section to `Run Context`.

This section should stay compact and answer only run-scoped questions:

- which selectors were used
- which variables were bound
- which secret references were required
- which spec snapshot files were included in the run

It should not try to show full authored spec bodies or effective goals.

### Spec Detail

Each spec section should focus on two layers:

1. Spec summary
2. Main debugging workspace

Recommended structure:

```text
Spec header
  name, status, path, duration

Main workspace
  left: agent action timeline
  right: recording, screenshot, action, reasoning, analysis, trace, meta, raw links
```

The important rule is that the HTML report should prioritize execution evidence. Authored spec content and effective goal remain available in the artifact bundle, but they are no longer part of the main page layout.

## Data Model Impact

No manifest-schema change is required for this follow-up.

The current `RunManifestSpecRecord` already contains the exact fields the renderer needs:

- `authored` for a formatted test-spec view
- `effectiveGoal` for the compiled-goal view
- `snapshotYamlPath` for raw YAML access
- `snapshotJsonPath` for raw parsed access

The architecture decision is to keep authored/effective input in `run.json`, but not render it in the report page by default.

## Code Changes

### `packages/cli/src/reportTemplate.ts`

Primary change area.

Planned updates:

- rename the run-wide `Inputs` heading to `Run Context`
- remove `Authored Spec` and `Effective Goal` from the always-visible detail grid
- keep or lightly simplify spec headers and index rows without adding new UI controls unless needed for layout balance
- ensure step-selection JavaScript only updates step-related cards

The resulting spec render shape should look roughly like:

```ts
function renderSpecSection(spec) {
  return `
    <section>
      ${renderSpecHeader(spec)}
      ${renderSpecWorkspace(spec)}
    </section>
  `;
}
```

### `packages/cli/src/reportWriter.ts`

No storage refactor is expected. The preferred approach is to reuse the current manifest unchanged.

### `packages/common/src/models/RunArtifacts.ts`

No required schema change.

If implementation proves that a tiny display-only field would materially simplify the template, it should be optional and derived from existing data rather than changing artifact semantics.

## Tests

Update report-oriented tests so they verify:

- the run page labels the run-wide section as `Run Context`
- the default spec detail grid no longer shows permanent `Authored Spec` and `Effective Goal` cards
- the rendered HTML does not introduce a replacement disclosure surface for those fields
- snapshot YAML links and raw artifact access still exist where already appropriate
- `run.json` remains unchanged as the canonical data source

## Risks

- removing the visible cards may make some users unaware that authored/effective input still exists in artifacts
- if the report no longer exposes any obvious path to spec snapshots, users may need README or CLI guidance
- tests should avoid brittle full-HTML snapshots and instead assert on the new interaction structure

## Resolved Decisions

1. This follow-up changes report presentation, not artifact storage.
2. Authored spec and effective goal remain part of `run.json`.
3. The default spec workspace should prioritize failure/debugging evidence over authored-input display.
4. This follow-up should remove the inline UI rather than replacing it with a new drawer, modal, or tab set.
