## Context

The `finalruntestspec` codebase currently uses `testsuite` and `testsuiteSchema` internally, while the filesystem has already migrated to using `.finalrun/suites/`. This discrepancy leads to confusion when working with the code.

## Goals / Non-Goals

**Goals:**
- Rename internal types and schemas from `testsuite` to `suite`.
- Update all variable names and imports to use the new unified naming.
- Ensure all tests and validation logic continue to work correctly with the new names.

**Non-Goals:**
- Changing the external directory structure (already `.finalrun/suites/`).
- Changing the YAML file format itself (only internal representation).

## Decisions

1. **Source of Truth**: Rename `testsuiteSchema` to `suiteSchema` in `src/schemas/grammar.ts`.
2. **Cascading Renames**: All variables, types, and logic previously named `testsuite` will be updated to `suite`.
3. **Pluralization**: Standardize on `suites` for collections (formerly `testsuites`).
4. **Validation Logic**: Update `src/commands/validate.ts` to use `suiteSchema` and update error message strings that reference the old names.
5. **Test Data**: Update `test/workflow.test.mjs` assertions and object keys to match the new naming.

## Risks / Trade-offs

- **Internal API Breakage**: Any internal tools or scripts depending on these specific exported names will need updates.
- **Search & Replace Surface Area**: Ensuring all string literals (especially in test output) are correctly identified and updated.
