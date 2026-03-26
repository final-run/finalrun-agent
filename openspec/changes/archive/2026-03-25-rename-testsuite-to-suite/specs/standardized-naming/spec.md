## ADDED Requirements

### Requirement: internal-naming-consistency
All internal code references to "testsuite" should be renamed to "suite" to match the filesystem convention of using `.finalrun/suites/`.

#### Scenario: schema-validation
- **WHEN** validating a test suite YAML file in `src/commands/validate.ts`
- **THEN** it should use the `suiteSchema` instead of `testsuiteSchema`.

#### Scenario: test-execution
- **WHEN** running tests in `test/workflow.test.mjs` that previously asserted on `testsuite` keys
- **THEN** they should now assert on `suite` keys in the test output or object structure.
