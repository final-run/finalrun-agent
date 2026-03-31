---
name: use-finalrun-cli
description: Use the published FinalRun CLI to install, configure, validate, run, troubleshoot, and inspect reports for repo-local mobile test workspaces. Trigger this skill for requests involving finalrun, finalrun-agent, check, test, suite, doctor, runs, start-server, or report serve.
---

# FinalRun CLI Guide and Operator

You help repo users safely use the published `finalrun` CLI inside repositories that contain `.finalrun/`.

## Scope

- Default audience: repo users running FinalRun in an app repository.
- Default scope: published CLI usage, not monorepo contributor workflows.
- If the user wants to create or edit YAML tests, suite manifests, or env bindings, hand off to the `generate-finalrun-test` skill instead of duplicating that workflow here.

## Source of Truth

- Prefer local truth over memory:
  - the repo `README.md`
  - local CLI help such as `finalrun --help`, `finalrun test --help`, and `finalrun suite --help`
  - the actual workspace files under `.finalrun/`
- Do not invent unsupported commands such as `finalrun init`.

## Workflow

### 1. Ground in the repo first

Before asking questions or proposing fixes, inspect the current state:

- confirm whether `finalrun` is available on `PATH` if command execution matters
- inspect `.finalrun/config.yaml` if present
- inspect `.finalrun/env/` if present
- inspect `.finalrun/tests/`
- inspect `.finalrun/suites/`

Use that inspection to determine:

- whether the repo already contains a valid `.finalrun/` workspace
- which environment files exist
- whether the user's selector or suite path resolves
- whether config already provides default `env` or `model`

### 2. Handle missing `.finalrun/` explicitly

If `.finalrun/` is missing:

- explain that the CLI must run from a repository containing `.finalrun/`
- show the expected structure
- offer a scaffold plan or route the user to `generate-finalrun-test` if they want help authoring the initial files
- do not claim that the CLI can bootstrap the workspace automatically

Expected structure:

```text
.finalrun/
  tests/
  suites/
  env/        # optional
  config.yaml # optional
```

### 3. Explain commands before executing them

- Briefly explain what a command will validate or run.
- Keep examples copyable and repo-relative.
- Distinguish read-only validation from commands that may launch work, use provider credits, or open UI.

### 4. Follow the safety policy

Safe to run without extra approval when the user asks:

- `finalrun check`
- `finalrun doctor`
- `finalrun runs`

Ask before executing:

- `finalrun test`
- `finalrun suite`
- `finalrun start-server`
- `finalrun report serve`

Why ask first:

- test execution can take time and may consume AI provider credits
- server commands can start background processes and open the browser

Prefer `finalrun suite <path>` over `finalrun test --suite <path>`, but mention that `finalrun test --suite <path>` remains supported for compatibility.

## Real CLI Behavior

Install the published package with:

```sh
npm install -g @finalrun/finalrun-agent
```

The package exposes both `finalrun` and `finalrun-agent`.

Command behavior:

- `finalrun check`
  - validates the `.finalrun` workspace, selectors, suite manifests, and env bindings
  - uses `.finalrun/config.yaml` `env` when `--env` is omitted
- `finalrun test`
  - runs one or more specs from `.finalrun/tests`
  - requires `--model <provider/model>` or `.finalrun/config.yaml` `model`
  - supports `--env`, `--platform`, `--app`, `--suite`, and `--api-key`
- `finalrun suite`
  - runs one suite manifest from `.finalrun/suites`
  - requires `--model <provider/model>` or `.finalrun/config.yaml` `model`
  - supports `--env`, `--platform`, `--app`, and `--api-key`
- `finalrun doctor`
  - checks host readiness for Android and iOS local runs
- `finalrun runs`
  - lists local reports from `~/.finalrun/workspaces/<workspace-hash>/artifacts`
- `finalrun start-server`
  - starts or reuses the local report UI for the current workspace
- `finalrun report serve`
  - compatibility alias for `finalrun start-server`

Explicit CLI flags override `.finalrun/config.yaml` defaults.

## Troubleshooting Rules

Diagnose from the actual CLI output first. Do not guess.

- Missing `.finalrun/`:
  - explain that FinalRun must be run from a repository containing `.finalrun/`
- Missing `.finalrun/tests/`:
  - explain that this directory is required by the CLI
- Missing env bindings:
  - `${variables.*}` and `${secrets.*}` resolve from `.finalrun/env/*.yaml`
  - if the user names an environment, verify that `.finalrun/env/<name>.yaml` exists
  - env-free specs can still validate without env files, but specs that reference bindings cannot
- Missing model:
  - `finalrun test` and `finalrun suite` need `--model <provider/model>` or `.finalrun/config.yaml`
- Provider credentials:
  - verify the provider-specific API key is present when the user wants to run tests
  - `openai/...` uses `OPENAI_API_KEY`
  - `google/...` uses `GOOGLE_API_KEY`
  - `anthropic/...` uses `ANTHROPIC_API_KEY`
- Selector and suite resolution:
  - `finalrun test auth/login.yaml` resolves from `.finalrun/tests/auth/login.yaml`
  - `finalrun suite smoke.yaml` resolves from `.finalrun/suites/smoke.yaml`
  - explicit `.finalrun/tests/...` and `.finalrun/suites/...` paths still work
- Invalid `.finalrun/config.yaml`:
  - point to the YAML or config error instead of guessing intended values
- App overrides:
  - `.apk` overrides imply Android
  - `.app` overrides imply iOS
  - fix mismatched `--platform` instead of ignoring it

## Coordination with `generate-finalrun-test`

This skill is for CLI usage, validation, execution, and troubleshooting.

If the user asks to:

- create a new YAML test
- update a suite manifest
- add or change `.finalrun/env/*.yaml` bindings
- plan a new test flow

route that work to `generate-finalrun-test`.

This skill may still explain where the CLI expects those files and how selectors resolve, but it should not duplicate the YAML authoring workflow.

## Response Patterns

- If the user asks, "How do I install and use FinalRun in my repo?":
  - explain installation, expected `.finalrun/` layout, and the normal `check` then `test` or `suite` flow
- If the user asks, "Run `finalrun check` and explain any issues":
  - inspect the workspace first, then run `finalrun check`, then interpret the output
- If the user asks, "Run `auth/login.yaml` on Android with `dev`":
  - verify the selector, env file, and model situation first
  - explain the exact command
  - ask before executing `finalrun test`
- If the user asks, "Show me recent runs and open the report UI":
  - run `finalrun runs`
  - ask before `finalrun start-server`
- If the user asks to create a login smoke test:
  - route to `generate-finalrun-test`

## Copyable Examples

```sh
npm install -g @finalrun/finalrun-agent
```

```sh
finalrun check --env dev
```

```sh
finalrun test auth/login.yaml --env dev --platform android --model google/gemini-3-flash-preview
```

```sh
finalrun suite smoke.yaml --env dev --platform ios --model anthropic/claude-3-7-sonnet
```

```sh
finalrun runs
```

```sh
finalrun start-server
```

```sh
finalrun --help
finalrun test --help
finalrun suite --help
```
