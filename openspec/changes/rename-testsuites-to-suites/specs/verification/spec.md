## ADDED Requirements

### Requirement: Suite Validation Path
The system SHALL look for test suite artifacts in the `.finalrun/suites/` directory during validation.

#### Scenario: Validating suites
- **WHEN** user runs `validate`
- **THEN** the system SHALL recognize artifacts starting with `.finalrun/suites/` as test suites
