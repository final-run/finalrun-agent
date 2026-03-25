## ADDED Requirements

### Requirement: New tests SHALL prefer feature-foldered paths

New runnable test files SHALL be planned under feature-grouped folders inside `.finalrun/tests/` when the feature grouping is clear.

#### Scenario: Feature grouping is obvious from the request

- **WHEN** a new test plan clearly targets a feature such as `login`, `search`, or another identifiable feature area
- **THEN** new test file paths SHALL default to `.finalrun/tests/<feature-folder>/<file>.yaml`
- **AND** the approved plan SHALL record those foldered target paths explicitly

#### Scenario: Existing feature folder already exists

- **WHEN** relevant existing tests already live under a feature-specific folder in `.finalrun/tests/`
- **THEN** new or updated test scenarios for that feature SHALL prefer that existing folder structure

### Requirement: Updates SHALL target existing feature-specific tests when relevant

When an approved scenario updates existing coverage, the system SHALL reuse the relevant existing test path rather than creating a new flat test file.

#### Scenario: Matching existing feature test is found

- **WHEN** planning finds a relevant existing test for the requested feature
- **THEN** the approved scenario SHALL target that existing file path for update
- **AND** apply SHALL rewrite that file in place

### Requirement: Folder ambiguity SHALL be surfaced before approval

The system SHALL not silently hide uncertainty about the correct feature folder for new tests.

#### Scenario: Folder choice is ambiguous

- **WHEN** the planner cannot confidently infer the right feature folder for a new test
- **THEN** the plan SHALL call out that ambiguity in the scenario reasoning or impact summary
- **AND** the operator SHALL be able to resolve it by editing or approving the plan before apply

### Requirement: Testsuite references SHALL follow approved foldered test paths

Testsuites SHALL reference the final approved test paths, including feature folders.

#### Scenario: Testsuite references foldered tests

- **WHEN** apply creates or updates a testsuite for feature-grouped tests
- **THEN** the testsuite SHALL reference the exact approved `.finalrun/tests/<feature-folder>/...` paths
