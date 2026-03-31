## ADDED Requirements

### Requirement: Test command resolves spec paths from the workspace tests root
The CLI SHALL resolve positional spec arguments passed to `finalrun test` against the current workspace's `.finalrun/tests` directory so users do not need to include the `.finalrun/tests/` prefix in standard commands.

#### Scenario: Relative spec selector
- **WHEN** a user runs `finalrun test login/auth.yaml` from a repository containing `.finalrun/`
- **THEN** the CLI selects `.finalrun/tests/login/auth.yaml`
- **AND** it executes the same spec that would have been selected by the explicit `.finalrun/tests/login/auth.yaml` path

#### Scenario: Explicit test root path remains valid
- **WHEN** a user runs `finalrun test .finalrun/tests/login/auth.yaml`
- **THEN** the CLI accepts the selector
- **AND** it resolves the same spec as the shorter workspace-relative form

### Requirement: Suite command resolves suite paths from the workspace suites root
The CLI SHALL provide a `finalrun suite <path>` command that resolves suite manifests against the current workspace's `.finalrun/suites` directory so users do not need `--suite` or the `.finalrun/suites/` prefix in standard commands.

#### Scenario: Relative suite selector
- **WHEN** a user runs `finalrun suite login/auth_suite.yaml` from a repository containing `.finalrun/`
- **THEN** the CLI selects `.finalrun/suites/login/auth_suite.yaml`
- **AND** it executes the suite using the same resolution rules currently used for suite manifests

#### Scenario: Suite command accepts run options
- **WHEN** a user runs `finalrun suite login/auth_suite.yaml --env dev --platform android --model google/gemini-3-flash-preview`
- **THEN** the CLI applies those options to the suite run
- **AND** it reuses the existing environment, platform, model, and app override behavior used by `finalrun test`

### Requirement: Legacy suite flag remains supported during migration
The CLI SHALL continue to accept `finalrun test --suite <path>` and resolve it through the same suite execution pipeline as `finalrun suite <path>` until a separate breaking-change decision is made.

#### Scenario: Legacy suite invocation remains valid
- **WHEN** a user runs `finalrun test --suite login/auth_suite.yaml`
- **THEN** the CLI selects `.finalrun/suites/login/auth_suite.yaml`
- **AND** it resolves and executes the same suite contents as `finalrun suite login/auth_suite.yaml`
