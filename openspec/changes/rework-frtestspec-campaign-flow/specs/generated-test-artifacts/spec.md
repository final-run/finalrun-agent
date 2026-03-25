## ADDED Requirements

### Requirement: Approved test specs SHALL be written to the FinalRun tests workspace
The system SHALL write generated test YAML files for an approved campaign within `.finalrun/tests/` and MUST NOT write those runnable test files under `frtestspec/changes/`.

#### Scenario: Approved campaign generates test specs
- **WHEN** a user generates test specs for an approved campaign
- **THEN** the system writes the test files under `.finalrun/tests/`
- **AND** the system does not write runnable test files under `frtestspec/changes/<campaign>/`

### Requirement: Approved testsuite artifacts SHALL be written to the FinalRun testsuite workspace
The system SHALL write generated testsuite artifacts for an approved campaign under `.finalrun/testsuite/`.

#### Scenario: Approved campaign generates a testsuite artifact
- **WHEN** a user requests a testsuite for an approved campaign
- **THEN** the system writes the testsuite artifact under `.finalrun/testsuite/`

### Requirement: Generation SHALL respect the approved artifact request
The system SHALL generate only the artifact types approved in the plan, which may be tests, testsuite artifacts, or both.

#### Scenario: Approved plan requests test specs only
- **WHEN** an approved plan requests tests but not a testsuite
- **THEN** the system generates test files only
- **AND** the system does not create a testsuite artifact

#### Scenario: Approved plan requests test specs and a testsuite
- **WHEN** an approved plan requests both test files and a testsuite
- **THEN** the system generates both artifact types in their respective workspace directories

### Requirement: Generation SHALL update impacted existing files and create new approved files
The system SHALL update existing files when the approved plan marks them as impacted existing assets. The system SHALL create new files when the approved plan marks them as new coverage.

#### Scenario: Approved plan updates an existing test file
- **WHEN** an approved plan marks an existing file under `.finalrun/tests/` as an impacted asset
- **THEN** generation updates that file instead of creating a duplicate

#### Scenario: Approved plan creates a new test file
- **WHEN** an approved plan marks a test as new coverage
- **THEN** generation creates a new file for that coverage in the appropriate workspace directory

### Requirement: Validation SHALL resolve campaign outputs from FinalRun workspace directories
The system SHALL validate generated campaign outputs from `.finalrun/tests/` and `.finalrun/testsuite/` rather than expecting them inside `frtestspec/changes/<campaign>/ui-tests/`.

#### Scenario: Validation inspects FinalRun workspace artifacts
- **WHEN** a user validates a generated campaign
- **THEN** the system resolves the campaign's generated outputs from `.finalrun/tests/` and `.finalrun/testsuite/`
- **AND** the system reports errors against those workspace artifacts
