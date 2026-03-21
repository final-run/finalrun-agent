# Design

## Current State

The CLI surface in `packages/cli/bin/finalrun.ts` exposes one optional positional `[selector]` for both `check` and `test`. That value flows through `runCheck()` into `selectSpecFiles()` in `packages/cli/src/testSelection.ts`.

The downstream execution path already operates on `checked.specs: LoadedRepoTestSpec[]`, so the runner does not need a structural change. The feature is mainly a parser and selection-layer extension.

## Confirmed Current Behavior

Today `finalrun test` with no selector runs every YAML file discovered under `.finalrun/tests`, recursively. That behavior comes from `selectSpecFiles()` returning all collected YAML files when `selector` is absent.

## Recommended UX

Make `test` require one or more explicit targets.

Recommended command contract:

- `finalrun check [selectors...]`
- `finalrun test <selectors...>`

Each selector can be a file path, directory path, or glob. Comma-delimited values should also be accepted as a convenience layer, but they should not be the only supported multi-select format.

Examples:

```sh
finalrun check
finalrun check smoke.yaml
finalrun check auth/login.yaml profile/edit.yaml
finalrun test smoke.yaml --env staging
finalrun test smoke.yaml,auth/login.yaml --env staging
finalrun test auth/ --platform android --api-key=...
finalrun test 'auth/*' --platform android --api-key=...
finalrun test 'auth/**' --platform android --api-key=...
finalrun test smoke.yaml profile/edit.yaml --platform android --api-key=...
```

Why this shape:

- `test` stops accidentally executing the entire suite
- repeated positional args are the most standard CLI way to pass many paths
- comma splitting can be layered on for convenience without making the interface rigid
- directory arguments are easier to remember than forcing users to always write globs
- it still preserves the existing single-selector syntax for the common case

## CLI Changes

In `packages/cli/bin/finalrun.ts`:

- change `check` from `.argument('[selector]', ...)` to `.argument('[selectors...]', ...)`
- change `test` from `.argument('[selector]', ...)` to `.argument('<selectors...>', ...)`
- update the action signatures to receive `selectors: string[]`
- pass `selectors` through to `runCheck()` and `runTests()`
- update help text from singular to plural and mention files, directories, and globs

## Selection Layer Changes

Update `packages/cli/src/checkRunner.ts` and `packages/cli/src/testSelection.ts` so the public contract becomes:

```ts
selectSpecFiles(
  testsDir: string,
  selectors?: string[],
  options?: { requireSelection?: boolean },
): Promise<string[]>
```

Selection rules:

1. `check` with no selectors: return every YAML spec under `.finalrun/tests`, sorted lexicographically.
2. `test` with no selectors: throw an actionable error that at least one target is required.
3. One or many selectors:
   - split each CLI token on commas and trim whitespace
   - expand each normalized selector independently
   - allow a selector to be a direct YAML path, a directory path, or a glob
   - reject any selector that escapes `.finalrun/tests`
   - reject any selector that resolves to zero files
   - merge matches with first-seen ordering and de-duplicate by absolute path

Directory semantics:

- `abc/` or `abc`: recursive YAML discovery under that directory
- `abc/*`: direct child YAML files only
- `abc/**`: recursive YAML discovery under that directory subtree

This is the least surprising behavior for a developer CLI:

- a raw directory path behaves like other recursive developer tools
- `*` means shallow selection
- `**` means recursive selection

Note on shell behavior:

- unquoted `*` and `**` may be expanded by the shell before FinalRun receives them
- once `test` accepts many positional selectors, shell-expanded matches are still fine
- for consistent cross-shell behavior, docs should prefer quoted glob examples such as `'auth/**'`

Recommended implementation:

- add a normalization step that converts CLI input into flat selector tokens
- extract the current single-selector logic into `expandSelector(testsDir, selector): Promise<string[]>`
- add `expandDirectorySelector(testsDir, selector): Promise<string[]>`
- keep `collectYamlFiles()` as the source of truth for discovered specs
- build an ordered `Set` or `Map` while iterating through the selectors
- return the accumulated values as the final execution list

## Error Handling

Preserve the current actionable error style.

Examples:

- missing selection for `test`: `At least one test selector is required. Pass a YAML file, directory, or glob under .finalrun/tests.`
- non-YAML direct path: `Spec selector must point to a .yaml or .yml file: <selector>`
- missing direct file: `Spec selector not found: <resolved path>`
- directory with no YAML files: `No YAML specs found under selector "<selector>" inside <testsDir>`
- unmatched glob: `No specs matched selector "<selector>" inside <testsDir>`
- path escape: `Spec selector must stay inside <testsDir>`

For multi-selector input, fail fast on the first invalid selector. That keeps the implementation small and matches the existing behavior style.

## Impacted Files

- `packages/cli/bin/finalrun.ts`
- `packages/cli/src/checkRunner.ts`
- `packages/cli/src/testSelection.ts`
- `packages/cli/src/workspace.test.ts`
- `packages/cli/src/finalrun.test.ts`
- `README.md`

No code changes should be required in:

- `packages/cli/src/testRunner.ts`
- `packages/cli/src/specLoader.ts`
- `packages/cli/src/specCompiler.ts`
- reporting or goal-execution packages

Those layers already consume a resolved array of specs.

## Test Plan

Add or update tests for:

- `test` fails when invoked with no selectors
- `check` with two explicit YAML paths
- `check` with a direct file plus a glob
- `test` with a comma-delimited file list
- directory selectors for recursive discovery
- shallow `*` versus recursive `**` behavior
- duplicate elimination when one file appears in multiple selectors
- selector order preservation for explicit files
- unmatched selector errors in multi-selector mode
- CLI binary parsing for repeated positional selectors

## Open Question

The only optional extension I would defer is a repeatable `--spec` flag for CI readability. I would not make comma-separated input the only multi-select syntax because repeated positional args are more standard and play better with shell completion and shell-expanded globs.
