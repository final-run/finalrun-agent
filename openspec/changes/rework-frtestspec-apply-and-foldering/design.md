# Design: Rework frtestspec Apply And Foldering

## Context

`finalruntestspec` currently has four user-visible behaviors in the test workflow:

- `plan` creates `frtestspec/changes/<campaign>/test-plan.md`
- `generate` writes runnable artifacts from an approved plan
- `validate` checks generated YAML structure and testsuite references
- generated Codex skills expose `frtestspec-plan`, `frtestspec-generate`, and `frtestspec-validate`

That is mechanically correct, but the naming and ergonomics are still off. The actual action after approval is “apply the approved plan,” not just “generate files.” At the same time, tests still default to flat `.finalrun/tests/<feature>-<scenario>.yaml` paths, which is too coarse for larger workspaces and does not encourage feature ownership.

This change should tighten the workflow surface without reintroducing OpenSpec-style phase semantics. The right model is:

- `plan`: prepare the approved change contract
- `apply`: execute that approved contract and validate the result
- `validate`: optional standalone re-check
- `init`: setup/refresh the skill wrapper layer

## Goals / Non-Goals

**Goals:**

- rename the approved-plan execution command from `generate` to `apply`
- make `apply` run validation automatically before reporting success
- keep `validate` as a standalone CLI safety net, but not as a primary workflow skill
- simplify the skill surface to `frtestspec-plan` and `frtestspec-apply`
- remove `update` as a separate CLI command and fold managed-skill refresh into rerunning `init`
- group test outputs under feature folders when the grouping is clear
- make plan artifacts explicitly record the foldered target path and any ambiguity around it

**Non-Goals:**

- changing testsuite placement under `.finalrun/testsuite/`
- changing the approval gate semantics
- adding interactive prompts inside the CLI itself
- introducing provider-specific behavior beyond the existing Codex-first skill setup

## Decisions

### 1. Replace `generate` with `apply`

The CLI command and generated skill will use `apply <campaign-name>`. The underlying behavior remains “read approved plan metadata, write files, then verify them,” but the operator-facing language becomes `apply`.

Why this approach:

- it matches the meaning of an approved plan much better than `generate`
- it aligns with the user’s mental model: approval authorizes applying the change

Alternative considered:

- keep `generate` as an alias: rejected because it prolongs mixed vocabulary

### 2. Run validation inside `apply`

`apply` will write the approved artifacts and then invoke the same validation logic currently exposed by `validate`. If validation fails, `apply` fails.

Why this approach:

- it gives the workflow a safer default
- it keeps “apply approved plan” as a complete action rather than a half-step

Alternative considered:

- require a separate validation step every time: rejected because it adds friction to the default path

### 3. Keep `validate` as a CLI-only utility, not a workflow skill

`validate` stays available from the CLI, but managed skills will only expose `frtestspec-plan` and `frtestspec-apply`.

Why this approach:

- it keeps the main skill workflow focused
- it still preserves a useful debugging command for local/manual edits

Alternative considered:

- remove `validate` entirely: rejected because manual edits and debugging still benefit from a dedicated checker

### 4. Remove `update` and make `init` idempotent

`init` will become the single setup/refresh command for the skill wrapper layer. If config and managed skills already exist, rerunning `init` will refresh them rather than erroring or requiring a second command.

Why this approach:

- it simplifies the command surface
- unlike OpenSpec, `finalruntestspec` does not currently need a broader profile/delivery sync command

Alternative considered:

- keep `update` because OpenSpec has one: rejected because the tool’s scope is much smaller

### 5. Prefer feature-foldered test paths

When planning new test files, target paths should default to `.finalrun/tests/<feature-folder>/<file>.yaml` when a feature grouping can be inferred from:

- the campaign name
- relevant existing test paths
- strong source/context naming

When updating existing tests, the existing feature-specific path wins.

Why this approach:

- it scales better than flat test paths
- it matches the user’s expectation that test files belong to a feature area

Alternative considered:

- keep flat paths and rely on filenames only: rejected because discoverability degrades over time

### 6. Surface folder ambiguity in the plan instead of guessing silently

If the system cannot confidently infer the right feature folder, the plan should call that out explicitly in the scenario reason and impact so the operator can approve or refine it before apply.

Why this approach:

- it keeps the approval gate meaningful
- it avoids burying risky path guesses in generated output

Alternative considered:

- always derive folder from campaign slug: rejected because existing workspaces may already have a stronger feature structure

## Risks / Trade-offs

- [Risk] Existing habits or scripts using `generate` and `update` will break.
  Mitigation: document the rename and keep the migration simple through `plan`, `apply`, `validate`, and rerunnable `init`.

- [Risk] Automatic validation after apply may feel stricter than before.
  Mitigation: keep `validate` logic deterministic and reuse the existing validator rather than adding new hidden checks.

- [Risk] Folder inference may still be wrong in edge cases.
  Mitigation: make plan impact explicit and route ambiguity through plan review instead of applying silently.

- [Risk] Existing flat test paths may coexist with new foldered ones.
  Mitigation: prefer updates in place for existing coverage and only create new grouped folders when adding new coverage or when the approved plan explicitly moves paths.

## Migration Plan

1. Rename `generate` to `apply` in CLI registration, runtime helpers, skills, docs, and tests.
2. Make `apply` call the existing validation logic after writing artifacts.
3. Remove the separate `update` command and make `init` refresh managed skills/config when rerun.
4. Update path planning defaults to produce feature-foldered `.finalrun/tests/<feature>/...` paths where possible.
5. Add or update tests for apply-with-validation, idempotent init, reduced skill surface, and folder-aware target paths.

## Open Questions

- None. Folder uncertainty will be handled through explicit plan output rather than hidden heuristics.
