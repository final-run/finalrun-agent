[![License: Apache-2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

# finalrun-agent

`finalrun-agent` is an AI-driven CLI for mobile app testing. You define repo-local tests in YAML, run them against Android or iOS targets, and inspect local run artifacts from the terminal.

Install the npm package globally:

```sh
npm install -g @finalrun/finalrun-agent
```

The package installs the `finalrun` command and also exposes `finalrun-agent` as an alias.

During global installation, FinalRun stages its native driver assets under
`~/.finalrun/assets/<version>/`. Run artifacts are stored separately under
`~/.finalrun/workspaces/<workspace-hash>/artifacts`, while repository-local `.finalrun/`
directories remain dedicated to YAML specs, env files, and config.

## Quick Start

1. Create a `.finalrun/` workspace in the mobile app repo you want to test.
2. Add at least one YAML spec under `.finalrun/tests/`.
3. Configure the AI provider key you want to use.
4. Validate the workspace with `finalrun check`.
5. Run a test with `finalrun test`.

Example workspace layout:

```text
.finalrun/
  config.yaml
  tests/
    smoke.yaml
    auth/
      login.yaml
  suites/
    smoke.yaml
  env/
    dev.yaml
```

Minimal test spec:

```yaml
name: login_smoke
description: Verify that a user can log in and reach the home screen.

steps:
  - Launch the app.
  - Enter ${secrets.email} on the login screen.
  - Enter ${secrets.password} on the password screen.
  - Verify the home screen is visible.
```

Optional environment file:

```yaml
secrets:
  email: ${TEST_USER_EMAIL}
  password: ${TEST_USER_PASSWORD}

variables:
  locale: en-US
```

Optional workspace config:

```yaml
env: dev
model: google/gemini-3-flash-preview
```

`finalrun check` reads `env` from `.finalrun/config.yaml` when `--env` is omitted. `finalrun test` reads both `env` and `model` from config when the corresponding CLI flags are omitted. Explicit CLI flags always win over config.

Validate the workspace:

```sh
finalrun check --env dev
```

Run a test:

```sh
finalrun test smoke.yaml --env dev --platform android --model google/gemini-3-flash-preview
```

Run a suite manifest:

```sh
finalrun suite smoke.yaml --env dev --platform ios --model google/gemini-2.0-flash
```

## YAML Test Specs

FinalRun specs are plain YAML files stored under `.finalrun/tests/`.

- `name`: stable identifier for the scenario
- `description`: short human-readable summary
- `steps`: ordered natural-language steps executed by the agent

Environment placeholders are supported:

- `${secrets.*}` resolves from environment-variable-backed secrets
- `${variables.*}` resolves from non-sensitive values in `.finalrun/env/*.yaml`

Suite manifests live under `.finalrun/suites/` and list YAML files, directories, or globs that resolve under `.finalrun/tests/`.

```yaml
name: auth_smoke
description: Covers the authentication smoke scenarios.
tests:
  - auth/login.yaml
  - auth/logout.yaml
```

In standard usage:

- `finalrun test auth/login.yaml` resolves `auth/login.yaml` from `.finalrun/tests/`
- `finalrun suite auth_smoke.yaml` resolves `auth_smoke.yaml` from `.finalrun/suites/`

Explicit `.finalrun/tests/...` and `.finalrun/suites/...` paths still work for compatibility when you want them.

## CLI Commands

`finalrun check`

- Validates the `.finalrun` workspace, environment bindings, selectors, and suite manifests.
- Uses `.finalrun/config.yaml` `env` as the default when `--env` is omitted.

`finalrun test`

- Executes one or more YAML specs from `.finalrun/tests`.
- Requires a model from `--model <provider/model>` or `.finalrun/config.yaml`.
- Supports `--env`, `--platform`, `--app`, `--suite`, and `--api-key`, with CLI flags taking precedence over config.

`finalrun suite`

- Executes a suite manifest from `.finalrun/suites`.
- Requires a model from `--model <provider/model>` or `.finalrun/config.yaml`.
- Supports `--env`, `--platform`, `--app`, and `--api-key`, with CLI flags taking precedence over config.

`finalrun test --suite <path>` remains supported as a compatibility path, but `finalrun suite <path>` is the preferred standard.

`finalrun doctor`

- Checks host readiness for local Android and iOS runs.

`finalrun runs`

- Lists local reports from the workspace-scoped artifact store at `~/.finalrun/workspaces/<workspace-hash>/artifacts`.

`finalrun start-server`

- Starts or reuses the local report UI for the current workspace.

See command help for full options:

```sh
finalrun --help
finalrun test --help
finalrun suite --help
```

## Prerequisites

- Node.js `>=20`
- `npm`
- Android local testing:
  - `adb` available through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `PATH`
- iOS local testing when needed:
  - Xcode command line tools with `xcrun`

Native driver artifacts are built from this repo during development with:

```sh
npm run build:drivers
```

## Supported AI Providers

FinalRun requires a `provider/model` value from `--model <provider/model>` or `.finalrun/config.yaml`. It currently supports exactly `openai`, `google`, and `anthropic`, and resolves API keys in this order:

- `openai/...`: `OPENAI_API_KEY`
- `google/...`: `GOOGLE_API_KEY`
- `anthropic/...`: `ANTHROPIC_API_KEY`

Examples:

```sh
finalrun test smoke.yaml --platform android --model google/gemini-3-flash-preview
finalrun test smoke.yaml --platform android --model google/gemini-2.0-flash
finalrun suite smoke.yaml --platform ios --model anthropic/claude-3-7-sonnet
```

## Development

Contributor setup, monorepo structure, build commands, and testing expectations live in [CONTRIBUTING.md](CONTRIBUTING.md).

For source development in this monorepo, install workspace dependencies first:

```sh
npm ci
```

If you use git worktrees, do this once per fresh worktree before running `npm run build`, `npm run test`, `npm run dev:cli`, or any local `finalrun-dev` wrapper that executes the TypeScript sources directly.

Project policies:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE)
