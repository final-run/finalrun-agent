## 1. Expand Generic Token Set

- [x] 1.1 Add new noise words to `GENERIC_FEATURE_TOKENS` in `finalruntestspec/src/lib/test-plan.ts`: `basic`, `complex`, `confirm`, `critical`, `edge`, `ensure`, `existing`, `happy`, `main`, `negative`, `new`, `path`, `positive`, `primary`, `secondary`, `should`, `simple`, `validate`, `verify`

## 2. Add Slug-Stripping Logic

- [x] 2.1 Create a `stripGenericTokens(slug: string): string` helper that strips leading and trailing `GENERIC_FEATURE_TOKENS` from a slug, falling back to `'coverage'` if the result is empty
- [x] 2.2 Call `stripGenericTokens()` at the end of `buildScenarioFileSlug()` on the final slug before returning

## 3. Testing

- [x] 3.1 Add a unit test verifying that a campaign like `add-language-critical-flows` with scenario "Add Second Secondary Language" produces a clean file slug without "critical" or "flows"
- [x] 3.2 Add a unit test verifying that stripping all tokens down to empty falls back to `coverage`
- [x] 3.3 Run `npm test` in `finalruntestspec/` and confirm all tests pass
