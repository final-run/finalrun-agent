## 1. Schema Renaming

- [x] 1.1 Rename `testsuiteSchema` to `suiteSchema` in `src/schemas/grammar.ts`.
- [x] 1.2 Update the TSDoc/JSDoc comment for `suiteSchema` to reflect the new name.
- [x] 1.3 Update exports in `src/schemas/grammar.ts` to use `suiteSchema`.

## 2. Command & Library Updates

- [x] 2.1 Update `src/commands/validate.ts` to import `suiteSchema` and rename `testsuite` variables to `suite`.
- [x] 2.2 Update `src/lib/test-plan.ts` to rename `testsuite` occurrences to `suite`.
- [x] 2.3 Perform a global search and replace for `testsuite` -> `suite` and `testsuites` -> `suites` within the `src/` directory, specifically focusing on variable and type names.

## 3. Test Alignment

- [x] 3.1 Update `test/workflow.test.mjs` to work with the renamed `suite` keys in the test output.
- [x] 3.2 Update any mock data or assertions in other test files that use the old naming.
- [x] 3.3 Run `npm test` to verify all changes.

## 4. Final Polish

- [x] 4.1 Update internal error messages and console logs in `src/commands/validate.ts` to use "suite" instead of "testsuite".
- [x] 4.2 Review `README.md` for any remaining "testsuite" references that should be updated for consistency.
