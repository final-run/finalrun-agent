## ADDED Requirements

### Requirement: Strict YAML Output
The generated test files SHALL be strictly valid YAML documents.

#### Scenario: Valid YAML syntax
- **WHEN** the generator creates a `.yml` file
- **THEN** it must use exact 2-space indentation and proper quoting for strings with special characters, with no markdown code fences.

### Requirement: User-Focused Testing
The test specifications SHALL validate only user-facing functionality and interactions.

#### Scenario: User interactions only
- **WHEN** planning or generating steps
- **THEN** steps must involve taps, swipes, inputs, or navigation, and exclude API or backend validations.

### Requirement: Idempotent Setup and Cleanup
Every test spec SHALL include setup steps that guarantee a clean starting state regardless of prior state.

#### Scenario: Setup handles cleanup
- **WHEN** a test validates adding an item
- **THEN** the setup flow must first check for and remove the item if it exists.

### Requirement: Planning Justification
The test plan scenarios SHALL justify the idempotency strategy.

#### Scenario: Plan contains reason
- **WHEN** creating a `test-plan.md`
- **THEN** each scenario's reason must explain why the proposed setup is idempotent.
