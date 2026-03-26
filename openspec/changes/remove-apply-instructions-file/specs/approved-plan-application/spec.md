## MODIFIED Requirements

### Requirement: Approved plans SHALL be executed through apply

The system SHALL expose the approved-plan execution workflow through `apply`. When the operator runs `frtestspec apply <campaign-name>`, the system SHALL print the generation instructions directly to stdout instead of writing them to a separate file on disk.

#### Scenario: Apply prints instructions to stdout

- **WHEN** the operator runs `frtestspec apply <campaign-name>` for an approved plan
- **THEN** the system SHALL print the generation instructions (system prompt, user prompt context, and next steps) to stdout
- **AND** it SHALL NOT write an `apply-instructions.md` file to disk

#### Scenario: Apply returns instructions programmatically

- **WHEN** `runApplyCommand()` is called programmatically
- **THEN** the result object SHALL contain an `instructions` field with the full instructions content
- **AND** the result object SHALL continue to contain a `files` field

#### Scenario: Unapproved plan blocks apply

- **WHEN** the operator runs `frtestspec apply <campaign-name>` for a plan whose `approval.status` is not `approved`
- **THEN** the system SHALL refuse to proceed
- **AND** it SHALL instruct the operator to review and approve the plan first
