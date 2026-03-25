# Design: Rename frtestspec Propose To Plan

## Context

`finalruntestspec` currently uses `propose` for the command that creates `frtestspec/changes/<campaign>/test-plan.md`. That naming came from the OpenSpec influence around proposals, but the actual artifact and user intent in this tool are narrower: users are planning test coverage.

The naming now appears in multiple places:

- the CLI command registered in `src/index.ts`
- the command implementation module `src/commands/propose.ts`
- generated Codex skill names and instruction text
- README examples and test expectations

Because `add-frtestspec-skill-setup` already shipped skill generation, partial renaming would create a confusing split where the CLI says one thing and the generated skills say another. The rename needs to be treated as a full surface-area update.

## Goals / Non-Goals

**Goals:**

- rename the planning entrypoint from `propose` to `plan`
- rename the implementation file to `plan.ts` so the source tree matches the command surface
- rename generated Codex skill names and embedded command examples to `frtestspec-plan`
- keep the planning behavior, plan schema, and generation flow unchanged

**Non-Goals:**

- changing how plans are generated or approved
- changing `generate` or `validate` naming
- preserving `propose` as a long-term alias
- rewriting historical OpenSpec artifacts that mention `propose`

## Decisions

### 1. Rename the CLI command outright instead of keeping an alias

The public command will become `plan <feature-name> [request...]`, and `propose` will stop being registered.

Why this approach:

- it matches the user's requested language directly
- it avoids a long tail of mixed terminology in help output and generated instructions

Alternative considered:

- keep `propose` as a deprecated alias: rejected because it preserves the wording the user wants to remove

### 2. Rename the command module to `plan.ts`

The implementation file will be renamed from `src/commands/propose.ts` to `src/commands/plan.ts`. Internal helper names such as `runProposeCommand` and `registerProposeCommand` will become `runPlanCommand` and `registerPlanCommand`.

Why this approach:

- it keeps the codebase aligned with the public interface
- it avoids future confusion when tracing command behavior from the source tree

Alternative considered:

- keep the old filename and only change the registered command: rejected because the mismatch would linger in maintenance work

### 3. Rename the generated Codex skill to `frtestspec-plan`

Managed skill generation will replace `frtestspec-propose` with `frtestspec-plan`. The generated content will call `frtestspec plan ...` and keep the rest of the workflow unchanged.

Why this approach:

- it keeps Codex-visible skill names aligned with the CLI surface
- it avoids teaching users to remember both `plan` and `propose`

Alternative considered:

- keep the old skill name while changing only the command invocation inside it: rejected because the skill name itself still exposes the unwanted term

## Risks / Trade-offs

- [Risk] Existing local habits and scripts using `frtestspec propose` will break.
  Mitigation: treat the change as explicitly breaking in docs and release notes.

- [Risk] Existing managed skill directories may linger after rename.
  Mitigation: `init` and `update` should overwrite the new managed files and the implementation can remove the old `frtestspec-propose` directory when refreshing Codex skills.

- [Risk] Historical project artifacts mention `propose`.
  Mitigation: leave historical OpenSpec records untouched and update only live code, docs, and generated skills.

## Migration Plan

1. Rename the command module and public registration from `propose` to `plan`.
2. Update skill generation to emit `frtestspec-plan` and stop generating `frtestspec-propose`.
3. Refresh README examples, help text, and test coverage to use `plan`.
4. Ensure managed skill refresh removes the old `frtestspec-propose` directory so regenerated projects converge on the new naming.

## Open Questions

- None. This rename is intentionally straightforward and breaking.
