## Why

The current naming `.finalrun/testsuite/` is inconsistent with the plural `.finalrun/tests/` and is somewhat verbose. Renaming it to `.finalrun/suites/` (plural) aligns with the existing `tests` directory and provides a more concise, standard convention for grouping multiple test suites.

## What Changes

- Rename the target directory from `.finalrun/testsuite/` to `.finalrun/suites/`.
- Update all CLI references, documentation, and logic to use `suites` instead of `testsuite` or `testsuites`.
- **BREAKING**: Existing test suites will need to be moved to the new `suites/` directory to be recognized by the CLI.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `test-planning`: Update the plan command to propose `.finalrun/suites/` paths instead of `.finalrun/testsuite/`.
- `artifact-generation`: Update the apply command to write test suite artifacts into `.finalrun/suites/`.
- `verification`: Update the validate command to look for suites in `.finalrun/suites/`.

## Impact

- `finalruntestspec/src/commands/plan.ts`: Update default target paths and success messages.
- `finalruntestspec/src/commands/apply.ts`: Update instruction templates and path logic.
- `finalruntestspec/src/commands/validate.ts`: Update path resolution and validation logic.
- `finalruntestspec/src/lib/test-plan.ts`: Update `OutputType` schema if necessary (though `testsuite` might still be used internally as a type, the *path* will change).
- `finalruntestspec/README.md`: Update documentation and examples.
