## Context

The current CLI already resolves positional spec selectors relative to `.finalrun/tests`, so `finalrun test login/auth.yaml` is supported by the implementation even though the public examples often show `.finalrun/tests/login/auth.yaml`. Suite execution is different: users must invoke `finalrun test --suite login/auth_suite.yaml`, which makes suites feel like a special mode instead of a first-class target.

This change should define one ergonomic standard without weakening workspace scoping. The CLI must keep resolving inputs inside the discovered `.finalrun` workspace, preserve existing run and report behavior, and avoid breaking current `--suite` users.

## Goals / Non-Goals

**Goals:**
- Standardize on `finalrun test <spec-path>` for specs under `.finalrun/tests/`.
- Introduce `finalrun suite <suite-path>` for suite manifests under `.finalrun/suites/`.
- Keep `.finalrun/tests` and `.finalrun/suites` implicit so users do not repeat those roots in common commands.
- Preserve the existing execution, validation, reporting, and environment resolution pipeline.
- Maintain backward compatibility for `finalrun test --suite <path>`.

**Non-Goals:**
- Removing `--suite` in this change.
- Changing how env, model, platform, or app override flags behave.
- Making `finalrun test` auto-detect whether a path is a spec or a suite.
- Redesigning `finalrun check` into a new command family in the same change.

## Decisions

### 1. Add a dedicated top-level `suite` command

The CLI will expose `finalrun suite <path>` as the preferred suite execution command. It will accept the same run-oriented options as `finalrun test`, but it will treat its positional path as a suite manifest rather than a spec selector.

Why this approach:
- It creates a symmetric mental model: `test` runs specs, `suite` runs suites.
- It avoids the current flag-based special case for suites.
- It keeps the command explicit, which is easier to document and reason about than hidden inference.

Alternative considered:
- Overload `finalrun test <path>` to infer suites when a path exists under `.finalrun/suites` or follows a naming pattern like `_suite.yaml`.
- Rejected because it introduces ambiguity and makes command behavior dependent on filesystem heuristics.

### 2. Keep implicit workspace-root resolution for both commands

`finalrun test <path>` will continue resolving positional selectors against `.finalrun/tests`. `finalrun suite <path>` will resolve its argument against `.finalrun/suites` using the same workspace scoping rules already used by `--suite`. Explicit `.finalrun/tests/...` and `.finalrun/suites/...` paths can remain accepted for compatibility, but short relative paths become the documented standard.

Why this approach:
- It matches how users think about repo-local tests and suites.
- It reduces repeated boilerplate in commands and docs.
- It preserves the current safety boundary that rejects paths escaping the workspace roots.

Alternative considered:
- Require explicit `.finalrun/...` prefixes everywhere.
- Rejected because it adds friction without increasing safety beyond the existing root checks.

### 3. Keep `--suite` as a compatibility alias

The existing `finalrun test --suite <path>` path will remain supported and will route through the same resolved suite execution pipeline as `finalrun suite <path>`. The new command becomes the preferred interface, but existing scripts keep working.

Why this approach:
- It lets us standardize the public interface without forcing an immediate breaking migration.
- It reduces rollout risk for CI jobs, scripts, and user habits already built around `--suite`.

Alternative considered:
- Remove `--suite` immediately.
- Rejected because it would create a breaking CLI change with little technical benefit.

### 4. Reflect the invoked command correctly in reporting and help text

Run metadata, logs, help output, and docs should show the command form the user actually ran. That means suite runs triggered via `finalrun suite` should no longer look like `finalrun test --suite ...` in generated run context unless the legacy command was truly used.

Why this approach:
- It reinforces the new standard in the places users already inspect.
- It prevents confusion when debugging or sharing run commands from artifacts.

## Risks / Trade-offs

- [Two suite invocation forms will coexist] -> Mitigation: make `finalrun suite` the documented default and keep parity tests for both paths.
- [Command option drift between `test` and `suite`] -> Mitigation: share option wiring and handler logic instead of duplicating behavior.
- [Validation remains asymmetrical because `check` still uses `--suite`] -> Mitigation: leave validation unchanged in this change and evaluate a follow-up if users want the same symmetry there.
- [Users may assume `.finalrun/tests` prefixes no longer work] -> Mitigation: preserve explicit path compatibility while documenting the shorter preferred form.

## Migration Plan

1. Add `finalrun suite <path>` alongside the existing `--suite` flag.
2. Update README, help text, and examples to prefer short relative paths and the new suite command.
3. Add compatibility tests proving `finalrun suite <path>` and `finalrun test --suite <path>` resolve and execute the same suite.
4. Evaluate whether future releases should deprecate `--suite` after the new standard has been adopted.

## Open Questions

- Should a follow-up change add a symmetric suite validation command, or is `finalrun check --suite <path>` acceptable to keep?
- Should the CLI print a short hint when `--suite` is used, or should migration remain documentation-only for now?
