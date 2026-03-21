# Tasks

- [x] Update `packages/cli/bin/finalrun.ts` so `check` accepts optional variadic selectors and `test` requires one or more selectors.
- [x] Change `CheckRunnerOptions` and related call sites from `selector?: string` to `selectors?: string[]`.
- [x] Add selector normalization that splits comma-delimited input into flat selector tokens.
- [x] Refactor `packages/cli/src/testSelection.ts` so it expands files, directories, and globs into a single ordered, de-duplicated file list.
- [x] Add directory handling where `dir/` is recursive, `dir/*` is shallow, and `dir/**` is recursive.
- [x] Make `test` fail fast with an actionable error when invoked without selectors.
- [x] Preserve existing workspace-boundary, YAML-only, and unmatched-selector validation behavior.
- [x] Add unit coverage for multi-selector expansion, comma splitting, directory semantics, ordering, duplicate removal, and failure cases.
- [x] Add CLI binary coverage for repeated positional selectors and update the README examples/help text, including quoted glob examples.
- [x] Verify the final behavior with `npm test` after dependencies are available in the workspace.
