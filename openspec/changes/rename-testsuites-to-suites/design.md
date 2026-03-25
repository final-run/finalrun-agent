## Context

`finalruntestspec` currently uses `.finalrun/testsuite/` as the default directory for test suite artifacts. However, the CLI sometimes refers to them as `testsuites` in strings and documentation. This change unifies the naming to `.finalrun/suites/` to be more concise and consistent with the plural `.finalrun/tests/` directory.

## Goals / Non-Goals

**Goals:**
- Rename `.finalrun/testsuite/` to `.finalrun/suites/` in all CLI logic.
- Update all user-facing strings and documentation to use `suites`.
- Ensure the `validate` command correctly checks the new path.

**Non-Goals:**
- Supporting both paths simultaneously (this is a breaking change).
- Changing the internal `testsuite` type name unless necessary for clarity.

## Decisions

- **Decision 1: Use plural `suites`**: We will use `suites` instead of `suite` (singular) to match the existing `tests` (plural) directory.
- **Decision 2: Update internal constants**: The `OutputType` internal string for test suites will remain `testsuite` for now to minimize logic changes, but the *path inference* logic will be updated to use `suites`.

## Risks / Trade-offs

- **[Risk] Breaking Change**: Users with existing `.finalrun/testsuite/` directories will find that the CLI no longer sees their suites.
  - **Mitigation**: Document the change clearly in the README and mention the migration step (renaming the directory).
