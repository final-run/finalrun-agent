## ADDED Requirements

### Requirement: Campaign planning SHALL use a single test plan artifact
The system SHALL create `frtestspec/changes/<campaign>/test-plan.md` as the only campaign artifact produced by `propose`. The system MUST NOT create `prompt.txt`, `ui-tests/`, or other runnable test assets under `frtestspec/changes/<campaign>/`.

#### Scenario: Propose creates a planning-only campaign workspace
- **WHEN** a user proposes a new test campaign
- **THEN** the system creates `frtestspec/changes/<campaign>/test-plan.md`
- **AND** the system does not create `prompt.txt`
- **AND** the system does not create `ui-tests/` under the campaign

### Requirement: Test plans SHALL embed the user request and planning context
The system SHALL write the user's request into `test-plan.md` and SHALL record the context sources used to derive the proposed scenarios, including relevant specs, code paths, and any user-provided files or data.

#### Scenario: Plan records the request and source material
- **WHEN** the system creates a test plan
- **THEN** the plan includes the original user request
- **AND** the plan references the source artifacts used to derive the scenarios

### Requirement: Test plans SHALL use a proposal-style structure
The system SHALL generate `test-plan.md` with proposal-style sections that summarize why the tests are needed and what will change. The plan MUST include sections covering `Why`, `What Changes`, `Capabilities`, and `Impact`, along with testing-specific sections for existing coverage, proposed scenarios, requested outputs, and approval state.

#### Scenario: Plan renders proposal-style sections
- **WHEN** the system creates a test plan
- **THEN** the plan includes `Why`, `What Changes`, `Capabilities`, and `Impact` sections
- **AND** the plan also includes testing-specific planning sections

### Requirement: Planning SHALL inspect existing FinalRun workspace coverage
The system SHALL inspect relevant files under `.finalrun/tests/` and `.finalrun/testsuite/` before proposing new outputs. The inspection MUST use relevant name matching first and file content inspection second to confirm whether discovered artifacts match the requested feature. The plan MUST summarize any relevant existing coverage it found and use that information to decide whether the request is adding new coverage, updating existing tests, or extending an existing testsuite.

#### Scenario: Relevant existing tests are present
- **WHEN** relevant files already exist under `.finalrun/tests/` or `.finalrun/testsuite/`
- **THEN** the plan identifies those existing artifacts
- **AND** the plan explains how the requested work relates to them

#### Scenario: Name match requires content confirmation
- **WHEN** a discovered file name appears relevant to the requested feature
- **THEN** the planner inspects the file content before treating it as impacted coverage
- **AND** the plan only lists it as relevant if the content matches the requested feature

### Requirement: Planning SHALL prefer specs and fall back to codebase inspection
The system SHALL use relevant formal specs when they are available. If relevant specs are not available, the system MUST inspect the codebase to infer the user-facing flows to test. If the user supplies files or data, the system MUST relate them back to the codebase when possible and use that relationship in the plan.

#### Scenario: Relevant specs exist for the requested feature
- **WHEN** a requested feature has relevant formal specs
- **THEN** the plan derives scenarios from those specs
- **AND** the plan may enrich them with code references when needed

#### Scenario: Relevant specs do not exist for the requested feature
- **WHEN** no relevant formal specs are available
- **THEN** the plan derives scenarios from relevant codebase files
- **AND** the plan cites the files it used to infer the scenarios

### Requirement: Proposed scenarios SHALL require explicit approval before generation
The system SHALL mark newly created plans as awaiting approval and MUST present the generated scenario list for human approval or refinement before any runnable artifacts are generated.

#### Scenario: Generation is requested before plan approval
- **WHEN** a user requests generation for a campaign whose plan is not approved
- **THEN** the system refuses to generate runnable artifacts
- **AND** the system instructs the user to review and approve the plan first

### Requirement: Test plan impact SHALL distinguish updates from new files
The system SHALL use the plan's `Impact` information to distinguish existing files that will be updated from new files that will be created. The plan MUST make that distinction explicit before approval.

#### Scenario: Plan includes both updated and new artifacts
- **WHEN** the requested work affects an existing test and also adds new coverage
- **THEN** the plan identifies the existing file that will be updated
- **AND** the plan identifies the new file that will be created
