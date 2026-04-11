<p align="center">
  <a href="https://finalrun.app/">
    <img alt="FinalRun logo" height="90" src="./.github/resources/Logo.png">
  </a>
</p>

<p align="center">
  <a aria-label="npm package version" href="https://www.npmjs.com/package/@finalrun/finalrun-agent" target="_blank">
    <img alt="npm version" src="https://img.shields.io/npm/v/@finalrun/finalrun-agent.svg?style=flat-square&label=npm&labelColor=000000&color=4630EB" />
  </a>
  <a aria-label="License: Apache-2.0" href="LICENSE">
    <img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square&color=33CC12" />
  </a>
</p>

<p align="center">
  <a aria-label="FinalRun website" href="https://finalrun.app/"><b>finalrun.app</b></a>
  &ensp;•&ensp;
  <a aria-label="FinalRun blog" href="https://blogs.finalrun.app/">Blog</a>
  &ensp;•&ensp;
  <a aria-label="Cloud device waitlist" href="https://docs.google.com/forms/d/e/1FAIpQLScOTaNWjvxIG8Ywn6THHYJuqBM-b86Y-Fx39YVoBVhHuBDZ2w/viewform?usp=publish-editor" target="_blank">Cloud Device Waitlist</a>
  &ensp;•&ensp;
  <a aria-label="FinalRun Slack community" href="https://join.slack.com/t/finalrun-community/shared_invite/zt-38qg6q9fq-9L87nNF8aX4HZ8_pn9KBgw" target="_blank">Join Slack Community</a>
</p>

<h6 align="center">Follow us on</h6>
<p align="center">
  <a aria-label="Follow FinalRun on X" href="https://x.com/get_final_run" target="_blank">
    <img alt="FinalRun on X" src="https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white" />
  </a>&nbsp;
  <a aria-label="FinalRun on GitHub" href="https://github.com/final-run" target="_blank">
    <img alt="FinalRun on GitHub" src="https://img.shields.io/badge/GitHub-222222?style=for-the-badge&logo=github&logoColor=white" />
  </a>&nbsp;
  <a aria-label="Follow FinalRun on LinkedIn" href="https://linkedin.com/company/finalrun/" target="_blank">
    <img alt="FinalRun on LinkedIn" src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" />
  </a>
</p>

`finalrun-agent` is an AI-driven CLI for mobile app testing. You define repo-local tests in YAML, run them against Android or iOS targets, and inspect local run artifacts from the terminal.

Run the installer to set up everything — Node.js, the CLI, skills, and platform tools:

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

The installer checks for Node.js (installs via nvm if missing), installs the `finalrun` CLI globally, adds FinalRun skills for Claude Code / Codex, and walks you through Android and iOS tool setup.

The package installs the `finalrun` command and also exposes `finalrun-agent` as an alias.

During global installation, FinalRun stages its native driver assets under
`~/.finalrun/assets/<version>/`. Run artifacts are stored separately under
`~/.finalrun/workspaces/<workspace-hash>/artifacts`. In your app repo, `.finalrun/`
holds YAML specs, **environment binding** files (`.finalrun/env/*.yaml`), and config.

**Secret values and API keys** belong in workspace-root **`.env`** files (see
[Important: Environment variables and `.env` files](#important-environment-variables-and-env-files)), not in YAML.

## Watch Demo

[![Watch the FinalRun demo](https://img.youtube.com/vi/q6CFoN-ohT4/maxresdefault.jpg)](https://www.youtube.com/watch?v=q6CFoN-ohT4)

Watch the demo on YouTube: https://www.youtube.com/watch?v=q6CFoN-ohT4

## Quick Start

1. Run the install script (see above) to set up the CLI and platform tools.
2. Create a `.finalrun/` workspace in the mobile app repo you want to test.
3. Add at least one YAML spec under `.finalrun/tests/`.
4. Configure the AI provider key you want to use.
5. Validate the workspace with `finalrun check`.
6. Run a test with `finalrun test`.

Example workspace layout (workspace root is the directory that contains `.finalrun/`):

```text
.env                 # optional; shared defaults (do not commit — see .gitignore below)
.env.dev             # optional; values when using env name "dev" (do not commit)
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

Check local host readiness for Android or iOS runs:

```sh
finalrun doctor
```

Run a test:

```sh
finalrun test smoke.yaml --env dev --platform android --model google/gemini-3-flash-preview
```

Run a suite manifest:

```sh
finalrun suite smoke.yaml --env dev --platform ios --model google/gemini-3-flash-preview
```

Inspect or serve reports from anywhere:

```sh
finalrun runs --workspace /path/to/mobile-app
finalrun start-server --workspace /path/to/mobile-app
finalrun server-status --workspace /path/to/mobile-app
finalrun stop-server --workspace /path/to/mobile-app
```

## Environment variables and `.env` files

> [!IMPORTANT]
> Store **real secrets and API keys** only in workspace-root **`.env`** and **`.env.<name>`** files (the same folder that contains `.finalrun/`), not in `.finalrun/env/*.yaml` (that file only lists **placeholder** names like `${MY_VAR}`). Add **`.env`** and **`.env.*`** to your **`.gitignore`** so those files are never committed.

### Where to put files

- **Workspace root** is the folder that contains `.finalrun/`. FinalRun finds it by walking up from your shell’s current directory, so dotenv paths are anchored to that root (not to `cwd` when you run from a subfolder).
- **Workspace root — dotenv (secrets and provider keys):**
  - **`.env`** — optional; values merged for all runs (see load order below).
  - **`.env.<name>`** — optional; used when that environment is active (e.g. `.env.dev` for `dev` from `--env dev` or `env: dev` in `.finalrun/config.yaml`). The name matches `.finalrun/env/<name>.yaml`, not the filename alone.
- **`.finalrun/env/<name>.yaml` — bindings only:** declares `secrets` as placeholders like `${TEST_USER_EMAIL}` and `variables` as plain values. The CLI resolves each `secrets` placeholder from the **shell environment** and from workspace-root `.env` / `.env.<name>` (see below). Do not put real secrets inside this YAML.

### Load order and usage

For a resolved environment name `N`, the CLI loads variables from `.env.N`, then fills missing keys from `.env`, then applies **`process.env`** (which wins if the same name is set in both a file and the environment).

That single workspace-root dotenv setup is used for:

- Resolving **`${secrets.*}`** references defined in `.finalrun/env/*.yaml`.
- Reading **AI provider API keys** (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`) for `finalrun test` and `finalrun suite`.

When no FinalRun environment is in use (env-free workspace), the CLI does not require a `.env.N` file for YAML bindings; you can still use `process.env` or `.env` for keys if applicable.

### Git: keep secrets out of the repo

**Do not commit** `.env` files. Add the following to your app repository’s **`.gitignore`** (or equivalent):

```gitignore
.env
.env.*
```

That ignores `.env`, `.env.dev`, `.env.staging`, and similar. The `finalrun-agent` monorepo uses the same pattern in its root `.gitignore`.

## YAML Test Specs

FinalRun specs are plain YAML files stored under `.finalrun/tests/`.

- `name`: stable identifier for the scenario
- `description`: short human-readable summary
- `steps`: ordered natural-language steps executed by the agent

Environment placeholders are supported:

- `${secrets.*}` resolves from OS environment variables and workspace-root **`.env` / `.env.<name>`** files (see [Important: Environment variables and `.env` files](#important-environment-variables-and-env-files))
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
- Supports `--env`, `--platform`, `--app`, and `--api-key`, with CLI flags taking precedence over config.
- To run a suite, use `finalrun suite <path>` — `--suite` is no longer accepted on `finalrun test`.

`finalrun suite`

- Executes a suite manifest from `.finalrun/suites`.
- Requires a model from `--model <provider/model>` or `.finalrun/config.yaml`.
- Supports `--env`, `--platform`, `--app`, and `--api-key`, with CLI flags taking precedence over config.

`finalrun doctor`

- Checks host readiness for local Android and iOS runs.

`finalrun runs`

- Lists local reports from the workspace-scoped artifact store at `~/.finalrun/workspaces/<workspace-hash>/artifacts`.
- Supports `--workspace <path>` so you can inspect a workspace from anywhere.

`finalrun start-server`

- Starts or reuses the local report UI for a workspace.
- Supports `--workspace <path>`, `--port <n>`, and `--dev`.

`finalrun server-status`

- Shows the current local report server status for a workspace.
- Supports `--workspace <path>`.

`finalrun stop-server`

- Stops the current local report server for a workspace.
- Supports `--workspace <path>`.

`finalrun report serve`

- Removed as a breaking CLI change. Use `finalrun start-server` instead.

See command help for full options:

```sh
finalrun --help
finalrun test --help
finalrun suite --help
```

## Prerequisites

> **Tip:** The install script (`curl -fsSL .../install.sh | bash`) handles most of these automatically. The details below are for reference.

Using FinalRun has two layers of setup:

- `finalrun check` requires the CLI, a `.finalrun/` workspace, and any needed config or secrets.
- Local `finalrun test` and `finalrun suite` runs additionally require host tooling for the target platform.
- `finalrun doctor` is the source of truth for local host readiness.

### Required for all usage

- Node.js `>=20`
- `npm`
- Install the published CLI: `npm install -g @finalrun/finalrun-agent`
- Run from a repository that contains `.finalrun/`
- At minimum, `.finalrun/tests/` must exist
- For `finalrun test` and `finalrun suite`: a configured model from `--model <provider/model>` or `.finalrun/config.yaml`
- For `finalrun test` and `finalrun suite`: the matching provider API key in `process.env`, `.env`, or `.env.<name>`

`finalrun check` does not require Android or iOS host tools.

### Required for Android local runs

- `adb` available through `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or `PATH`
- `emulator` on `PATH`; the current Android preflight requires it to discover and boot Android Virtual Devices
- `scrcpy` on `PATH`; FinalRun uses it for Android screen recording during local runs and treats it as required
- Bundled FinalRun Android driver assets present; the published CLI installs them automatically

### Required for iOS local runs

- macOS
- Xcode command line tools with `xcrun`
- `xcrun simctl`
- `unzip`
- `/bin/bash`
- `plutil`
- Bundled FinalRun iOS driver archives present; the published CLI installs them automatically

### Optional helpers

- `ffmpeg` compresses iOS recordings after capture
- `applesimutils` enables simulator permission helpers
- `lsof`, `ps`, and `kill` help with stale iOS driver cleanup

Verify local host readiness with:

```sh
finalrun doctor
finalrun doctor --platform android
finalrun doctor --platform ios
```

If you're developing from this repo instead of using the published package, build the native driver artifacts with:

```sh
npm run build:drivers
```

## Supported AI Providers

FinalRun requires a `provider/model` value from `--model <provider/model>` or `.finalrun/config.yaml`. It currently supports exactly `openai`, `google`, and `anthropic`, and resolves API keys in this order:

- `openai/...`: `OPENAI_API_KEY`
- `google/...`: `GOOGLE_API_KEY`
- `anthropic/...`: `ANTHROPIC_API_KEY`

Keys are read from **`process.env`** and from workspace-root **`.env` / `.env.<name>`** (same rules as in [Important: Environment variables and `.env` files](#important-environment-variables-and-env-files)). You can still pass `--api-key` to override.

Examples:

```sh
finalrun test smoke.yaml --platform android --model google/gemini-3-flash-preview
finalrun suite smoke.yaml --platform ios --model anthropic/claude-sonnet-4-6
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
