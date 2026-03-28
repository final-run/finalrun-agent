## Why

The `finalruntestspec` CLI recently standardized its directory structure, moving from `.finalrun/testsuite/` to `.finalrun/suites/`. However, the internal codebase still frequently uses `testsuite` and `testsuiteSchema`. Renaming these to `suite` and `suiteSchema` (and `testsuites` to `suites`) will improve internal consistency and align the code with the filesystem structure.

## What Changes

- Rename `testsuiteSchema` to `suiteSchema` in `src/schemas/grammar.ts`.
- Rename all internal occurrences of `testsuite` and `testsuites` to `suite` and `suites` respectively.
- Update `src/commands/validate.ts` to use new schema and variable names.
- Update `src/lib/test-plan.ts` and `test/workflow.test.mjs` to reflect the name changes.

## Capabilities

### New Capabilities
- `standardized-naming`: Internal naming alignment between code and filesystem for test suites.

### Modified Capabilities
- `test-validation`: The validation logic will now reference `suiteSchema` instead of `testsuiteSchema`.

## Impact

This is a developer-facing refactor that improves codebase maintainability. It does not change the CLI interface or usage, as the directory migration has already been initiated.
