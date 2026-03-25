# Rework frtestspec Campaign Flow

## Why

The current `finalruntestspec` workflow mixes planning artifacts and runnable outputs in the same `frtestspec/changes/<campaign>/` directory. It also splits the request context across `prompt.txt` and `test-plan.md`, then writes generated YAML into `ui-tests/`, which does not match FinalRun's workspace convention where committed runnable specs live under `.finalrun/tests/`.

That makes the workflow harder to trust and harder to use. The planning step should assemble a real scenario plan from the best available context, ask for approval, and only then generate runnable artifacts into the actual FinalRun workspace.

## What Changes

- make `frtestspec/changes/<campaign>/` a planning-only workspace that stores just `test-plan.md`
- remove `prompt.txt` and fold the original user request plus discovered context into `test-plan.md`
- make plan creation inspect existing `.finalrun/tests/` and `.finalrun/testsuite/` by relevant names first and then by file content so it can surface current coverage and decide whether the request should add new tests, extend an existing testsuite, or update existing assets
- make plan creation use formal specs when available, otherwise inspect the codebase; when the user supplies files or data, cross-reference them against the codebase and cite the sources used
- reshape `test-plan.md` to use an OpenSpec-like proposal summary with sections such as `## Why`, `## What Changes`, `## Capabilities`, and `## Impact`, followed by testing-specific planning and approval sections that identify which existing files will be updated and which new files will be created
- expand `test-plan.md` from a blank checklist into a generated scenario plan that asks the user to approve or refine it before generation
- change generation so approved test specs are written within `.finalrun/tests/` and approved testsuite artifacts are written under `.finalrun/testsuite/`, never under `frtestspec/changes/`
- make generation respect the approved artifact request: tests, testsuite, or both
- make regeneration update existing approved target files when the plan marks them as impacted, while new approved coverage creates new files
- update validation and operator guidance to follow the new output locations and approval gate

## Capabilities

### New Capabilities

- `test-plan-orchestration`: create planning-only campaign artifacts that embed the user request, gather context from specs, code, and user-provided inputs, and require approval before generation
- `generated-test-artifacts`: generate runnable test YAML and testsuite artifacts into the FinalRun workspace instead of the campaign folder

### Modified Capabilities

- None.

## Impact

- `finalruntestspec/src/commands/propose.ts`
- `finalruntestspec/src/commands/generate.ts`
- `finalruntestspec/src/commands/validate.ts`
- `finalruntestspec/README.md`
- existing project workspaces under `.finalrun/tests/` and `.finalrun/testsuite/`
- any helper code that resolves planning context, approval state, or FinalRun workspace output paths
