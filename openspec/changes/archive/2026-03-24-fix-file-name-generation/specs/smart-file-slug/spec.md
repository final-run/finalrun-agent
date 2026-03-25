## ADDED Requirements

### Requirement: Strip generic tokens from file slugs
The system SHALL strip common non-descriptive tokens from the leading and trailing edges of generated test file slugs before producing the final file name.

#### Scenario: Campaign name contains noise words
- **WHEN** the feature name is `add-language-critical-flows` and the scenario title is "Add Second Secondary Language"
- **THEN** the generated file slug SHALL NOT contain the words "critical" or "flows"

#### Scenario: Slug would become empty after stripping
- **WHEN** stripping all generic tokens from a slug would produce an empty string
- **THEN** the system SHALL fall back to using `coverage` as the file slug

#### Scenario: Meaningful middle tokens are preserved
- **WHEN** the scenario title produces a slug like `verify-login-screen-flow`
- **THEN** only the leading `verify` and trailing `flow` tokens SHALL be stripped, preserving `login-screen`

### Requirement: Expanded generic token set
The `GENERIC_FEATURE_TOKENS` set SHALL include at minimum the following noise words in addition to the existing set: `basic`, `complex`, `confirm`, `critical`, `edge`, `ensure`, `existing`, `happy`, `main`, `negative`, `new`, `path`, `positive`, `primary`, `secondary`, `should`, `simple`, `validate`, `verify`.

#### Scenario: All listed tokens are recognized
- **WHEN** any of the listed tokens appears at the leading or trailing edge of a file slug
- **THEN** it SHALL be stripped
