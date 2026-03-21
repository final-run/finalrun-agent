# Require Explicit Test Targets And Support Multi-Spec Selection

## Why

The current CLI accepts one optional positional selector for both `finalrun check` and `finalrun test`. That currently means:

- `finalrun test` runs every discovered YAML spec when no selector is provided
- running one YAML file by path
- running multiple specs through a single glob

There are two product gaps:

- `test` should require an explicit target instead of defaulting to the entire test tree
- users need to target an arbitrary mix of YAML files and folders in one command without reorganizing files first

This matters most for reruns of a small hand-picked batch such as one file, two files, or a directory subtree.

## Proposed Change

Change `finalrun test` so at least one selector is required. A selector can be:

- a repo-local YAML file path
- an absolute YAML file path inside `.finalrun/tests`
- a directory under `.finalrun/tests`
- a glob pattern scoped to `.finalrun/tests`
- a comma-separated selector list for convenience

Recommended examples:

```sh
finalrun test smoke.yaml
finalrun test smoke.yaml,auth/login.yaml
finalrun test auth/
finalrun test 'auth/*'
finalrun test 'auth/**'
finalrun test smoke.yaml auth/profile/
```

When multiple selectors are provided, FinalRun should expand them into one ordered, de-duplicated spec list and execute that list exactly once.

`finalrun check` can stay permissive and continue to validate the whole workspace when no selector is provided.

## Scope

- Update the CLI argument parsing for `check` and `test`
- Refactor the spec-selection layer to accept many selectors
- Make `test` require at least one target selector
- Add directory selector support
- Support comma-delimited selector input as a convenience form
- Preserve current validation and workspace-boundary rules
- Document the new command shape in the README
- Add tests for repeated files, directories, globs, duplicate matches, and failure cases

## Non-Goals

- Parallel spec execution
- New manifest formats
- Cross-workspace file selection
- Replacing glob support with a new flag-based API
