## ADDED Requirements

### Requirement: Single workspace-root dotenv for resolved environments

When the CLI resolves an active FinalRun environment name `N`, it SHALL load environment variables from `<workspace_root>/.env.N` and `<workspace_root>/.env` (per `CliEnv` precedence) before resolving `secrets` placeholders in `.finalrun/env/N.yaml`, where `workspace_root` is the directory containing `.finalrun/`.

The CLI SHALL use the same `workspace_root` when loading dotenv for provider API keys on `finalrun test` and `finalrun suite`, so users maintain one `.env` / `.env.N` location outside `.finalrun/`.

#### Scenario: Named env file supplies secret values

- **WHEN** `<workspace_root>/.env.dev` defines `MY_TOKEN=secret`
- **AND** `.finalrun/env/dev.yaml` contains `secrets.api_token: ${MY_TOKEN}`
- **AND** the CLI resolves environment `dev`
- **THEN** the CLI SHALL resolve `MY_TOKEN` to `secret` when building runtime bindings
- **AND** it SHALL NOT report that `MY_TOKEN` is missing solely because it was absent from the parent process environment

#### Scenario: Precedence of dotenv and process environment

- **WHEN** both `<workspace_root>/.env.dev` and the parent process define the same variable name
- **AND** the CLI resolves environment `dev`
- **THEN** the value from the parent process environment SHALL take precedence over the value from `.env.dev` for that variable

### Requirement: Workspace root anchors dotenv paths

The CLI SHALL resolve `.env.N` and `.env` relative to `workspace_root`, not relative to the process current working directory, so commands run from a subdirectory still load the same files as from the workspace root.

#### Scenario: Check from a subdirectory

- **WHEN** the user runs `finalrun check` with cwd inside the workspace but not equal to `workspace_root`
- **AND** `<workspace_root>/.env.dev` defines a variable referenced only there
- **AND** the resolved environment is `dev` with a `secrets` entry referencing that variable
- **THEN** the CLI SHALL load that variable successfully

### Requirement: No named dotenv load when no environment is resolved

When the CLI operates without a resolved FinalRun environment (empty bindings), it SHALL NOT require a `.env.N` file for YAML secret resolution.

#### Scenario: Env-free workspace unchanged

- **WHEN** the workspace uses the existing env-free validation path
- **THEN** the CLI SHALL behave as before for workspaces that do not use `.finalrun/env` bindings
