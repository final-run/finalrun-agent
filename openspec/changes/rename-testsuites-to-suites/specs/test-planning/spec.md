## ADDED Requirements

### Requirement: Proposed Suite Path
The system SHALL propose `.finalrun/suites/` as the default target path for test suite artifacts.

#### Scenario: Planning a new suite
- **WHEN** user runs `plan` with `testsuite` output
- **THEN** the proposed target path SHALL be `.finalrun/suites/<feature-name>.yaml`
