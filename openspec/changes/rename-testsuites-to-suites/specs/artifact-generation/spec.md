## ADDED Requirements

### Requirement: Suite Generation Path
The system SHALL write test suite artifacts into the `.finalrun/suites/` directory.

#### Scenario: Generating a suite
- **WHEN** user runs `apply` for a plan containing a test suite
- **THEN** the artifact SHALL be written to `.finalrun/suites/<filename>.yaml`
