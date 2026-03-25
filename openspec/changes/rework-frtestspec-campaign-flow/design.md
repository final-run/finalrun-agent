# Design

## Context

`finalruntestspec` currently treats `frtestspec/changes/<campaign>/` as both the planning area and the output area:

- `propose` creates `prompt.txt`, `test-plan.md`, and `ui-tests/`
- `generate` reads `prompt.txt` and `test-plan.md`, then writes runnable YAML into `ui-tests/`
- `validate` reads YAML back from that same campaign-local `ui-tests/` directory

That shape conflicts with FinalRun's workspace model, where committed runnable specs live under `.finalrun/tests/`. It also keeps the planning step too thin. The current plan template does not capture the user's request, does not record what project context was inspected, and does not create an approval checkpoint before generation.

The requested workflow is closer to a two-phase pipeline:

```text
user request
  -> inspect existing .finalrun/tests/ and .finalrun/testsuite/
  -> inspect specs and/or codebase, plus any provided files/data
  -> create test-plan.md with proposal-style summary + proposed scenarios
  -> human approval
  -> generate runnable tests/testsuites into .finalrun workspace
```

## Goals / Non-Goals

**Goals:**

- keep `frtestspec/changes/<campaign>/` as a planning-only workspace
- store the original user request directly inside `test-plan.md`
- inspect existing `.finalrun/tests/` and `.finalrun/testsuite/` to understand current coverage before proposing new outputs
- derive proposed scenarios from formal specs when available, otherwise from relevant code paths
- cross-reference any user-provided files or data with the codebase when possible
- make the generated `test-plan.md` feel like an OpenSpec proposal, not a thin checklist
- make the generated `test-plan.md` explicitly list impacted existing files and planned new files
- require explicit approval before generation
- generate runnable test specs within `.finalrun/tests/`
- generate runnable testsuite artifacts under `.finalrun/testsuite/`
- let the approved plan define whether the generator should emit tests, testsuite artifacts, or both

**Non-Goals:**

- redesign the FinalRun runner beyond the artifact placement and workflow changes needed here
- remove human review from the planning workflow
- define an entirely new runtime YAML grammar for FinalRun outside the tests and testsuite artifacts required by this change

## Decisions

### 1. Separate planning artifacts from runnable artifacts

`frtestspec/changes/<campaign>/` will hold planning state only. Runnable artifacts move to FinalRun workspace directories:

- tests -> `.finalrun/tests/`
- testsuites -> `.finalrun/testsuite/`

This keeps a clean separation between "what we intend to test" and "what FinalRun can execute."

Alternative considered:

- Keep generating inside `frtestspec/changes/` and copy artifacts later. Rejected because it duplicates the source of truth and makes validation/pathing harder.

### 2. Replace `prompt.txt` with a structured `test-plan.md`

The request context should live with the plan, not beside it. `test-plan.md` should carry:

- a proposal-style summary with sections such as `## Why`, `## What Changes`, `## Capabilities`, and `## Impact`
- the original user request
- existing workspace coverage discovered in `.finalrun/tests/` and `.finalrun/testsuite/`
- requested output types
- context sources used to build the plan
- proposed scenarios
- impacted existing files and planned new files
- approval state

This removes the current split-brain state between `prompt.txt` and `test-plan.md`.

Alternative considered:

- Keep `prompt.txt` as raw input and use `test-plan.md` only for checklist output. Rejected because it hides the full planning story across two files.

### 3. Inspect existing FinalRun workspace coverage before planning new outputs

Plan creation should inspect the current FinalRun workspace first:

1. scan `.finalrun/tests/` for relevant existing test files using name matches first
2. scan `.finalrun/testsuite/` for relevant existing suite definitions using name matches first
3. inspect candidate file contents to confirm the artifacts are actually relevant
4. record relevant matches in the plan
5. use that information to decide whether the request appears to be adding new coverage, extending an existing suite, or updating existing assets

This prevents the planner from acting as if the workspace is empty when relevant coverage already exists.

Alternative considered:

- Ignore current workspace artifacts and always plan from specs/code only. Rejected because it would duplicate or conflict with existing tests too easily.

### 4. Use a deterministic context resolution order for planning

Plan generation should gather context in this order:

1. record the user request and any explicitly supplied files or data
2. inspect existing `.finalrun/tests/` and `.finalrun/testsuite/` coverage
3. use formal feature specs as the primary behavior contract when they exist
4. fall back to relevant codebase files when specs are absent or incomplete
5. cite the sources used in the resulting plan

This preserves spec-first intent while still making the tool useful in code-first repositories.

Alternative considered:

- Always derive plans from codebase inspection alone. Rejected because formal specs should win when they exist.

### 5. Make approval an explicit, persisted plan state

Generation should not rely on chat memory alone. `test-plan.md` should store an approval state that `generate` can verify before writing runnable artifacts.

A lightweight metadata shape is sufficient, for example:

```yaml
status: draft
requested_outputs:
  - tests
sources:
  - type: spec
    path: openspec/...
```

The exact serialization can be markdown metadata or another simple parseable structure, but it must be machine-readable enough for `generate` to enforce.

Alternative considered:

- Rely on the operator to remember whether the plan was approved. Rejected because the CLI cannot safely enforce the workflow.

### 6. Map generated outputs by artifact type and plan impact

Approved test scenarios should generate runnable YAML within `.finalrun/tests/`. Approved suite requests should generate suite artifacts under `.finalrun/testsuite/`.

The generator should use the plan's approved output request to decide whether it emits:

- tests only
- testsuite only
- both

The plan should also declare file-level impact:

- existing test or suite files that will be updated
- new test or suite files that will be created

Generation should follow that approved impact directly:

- update existing files when the plan marks them as impacted existing assets
- create new files when the plan marks them as new coverage

This keeps generation aligned with the approved scope rather than always producing every possible artifact.

### 7. Validation should resolve FinalRun workspace outputs, not campaign-local output folders

`validate` should no longer expect `ui-tests/` inside `frtestspec/changes/<campaign>/`. It should validate the generated artifacts associated with the campaign from `.finalrun/tests/` and `.finalrun/testsuite/`.

This keeps validation aligned with the real execution surface.

## Risks / Trade-offs

- Codebase-derived plans may misread the intended behavior when specs are missing -> require file citations in the plan and keep the approval gate mandatory.
- Existing workspace inspection may find loosely related tests or suites -> keep the plan explicit about why each discovered file is considered relevant and let the user correct it during approval.
- A machine-readable approval state inside markdown can drift if edited manually -> validate the plan structure before generation and return actionable errors when it is malformed.
- `testsuite` generation introduces a new workspace artifact surface for this tool -> define the suite file shape and naming clearly during implementation and cover it with tests.
- Existing experimental campaigns may still contain `prompt.txt` or `ui-tests/` directories -> handle legacy layouts explicitly with migration guidance or compatibility errors.

## Migration Plan

1. Stop creating `prompt.txt` and `ui-tests/` for newly proposed campaigns.
2. Introduce the new `test-plan.md` structure with proposal-style sections, embedded request context, existing-coverage summary, explicit file impact, and approval metadata.
3. Update generation to write new artifacts into `.finalrun/tests/` and `.finalrun/testsuite/`.
4. Update validation and CLI messaging to resolve those workspace locations.
5. Document how legacy campaign folders should be cleaned up or regenerated.

## Resolved Decisions

1. Generated tests use `.finalrun/tests/` as the workspace root and do not require a dedicated per-campaign output folder.
2. Existing coverage discovery should use relevant name matching first, then inspect file content to confirm relevance.
3. Regeneration updates existing files when the approved plan marks them as impacted existing assets.
4. Newly approved coverage creates new files, and the plan's `Impact` section should make the update-vs-create decision explicit before generation runs.
