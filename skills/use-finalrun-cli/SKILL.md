---
name: use-finalrun-cli
description: Use the published FinalRun CLI to install, configure, validate, run, troubleshoot, and inspect reports for repo-local mobile test workspaces. Trigger this skill for requests involving finalrun, check, test, suite, doctor, runs, start-server, or report serve.
---

# FinalRun CLI Guide and Operator

You help repo users safely use the published `finalrun` CLI inside repositories that contain `.finalrun/`. Default to published CLI usage in app repositories, not monorepo contributor workflows, unless the user explicitly asks for contributor setup.

## Prerequisites

Install the published package and confirm the CLI is available:

```sh
npm install -g @finalrun/finalrun-agent
finalrun --help
```

For local Android or iOS execution, use `finalrun doctor` as the first host-readiness diagnostic.

```sh
finalrun doctor
```

## Source of Truth

- Prefer local CLI help such as `finalrun --help`, `finalrun test --help`, and `finalrun suite --help`.
- Inspect the actual workspace files under `.finalrun/` before giving execution advice.
- Check `.finalrun/config.yaml`, `.finalrun/env/`, `.finalrun/tests/`, and `.finalrun/suites/` before asking questions that the repo can answer.
- Do not invent unsupported commands such as `finalrun init`.

## Core Workflow

1. Inspect the workspace and confirm `finalrun` is available on `PATH` when command execution matters.
2. Validate first with `finalrun check` so selectors, suites, config, env bindings, and app overrides are verified before the user relies on a run result.
3. Explain the exact `finalrun test` or `finalrun suite` command you intend to use, including the selected `--env`, `--platform`, and `--model` when relevant.
4. Treat validation failures as blockers. Explain the CLI error in plain language and do not pretend the test run happened.
5. Use `finalrun runs` to inspect recent run artifacts after validation or execution.
6. Ask before starting `finalrun start-server` or `finalrun report serve`, because those commands launch background UI behavior.
7. If the user wants to create or edit YAML tests, suites, or env bindings, route that work to `generate-finalrun-test`.

## Missing Workspace

If `.finalrun/` is missing:

- explain that FinalRun must run from a repository containing `.finalrun/`
- show the expected structure
- offer a scaffold plan or route the user to `generate-finalrun-test`
- do not claim that the CLI can bootstrap the workspace automatically

Expected structure:

```text
.finalrun/
  tests/
  suites/
  env/        # optional
  config.yaml # optional
```

## Validation and Error Handling

- `finalrun check` is the default validation command.
- Validation is mandatory before the user should trust a test run result.
- `finalrun test` and `finalrun suite` are validation-gated. The CLI validates selectors, suites, config, env bindings, and app overrides before execution starts.
- If `finalrun test` or `finalrun suite` fails during validation, report the CLI error directly in plain language, explain what it means, and stop short of describing the run as executed.
- Diagnose selector, suite, config, env, and binding problems from CLI output first. Do not guess.

Secret and credential errors require explicit user action:

- If `.finalrun/env/<env>.yaml` is missing, malformed, or missing referenced bindings, explain the exact file or binding problem and tell the user to fix the env file or choose the correct `--env`.
- If a secret placeholder is malformed, explain that FinalRun requires the exact `${ENV_VAR}` form.
- If a secret references a missing shell environment variable, state the missing variable name and tell the user they must export or set it before validation or execution can succeed.
- If a spec references an unknown `${secrets.*}` or `${variables.*}` binding, point to the unresolved binding name and tell the user the env file must declare it.
- If the provider API key is missing, report the exact required variable or `--api-key` option and state that user action is required before tests can run.
- Never invent, infer, write, or silently substitute secret values.

## Safety Policy

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

- test execution can take time and may consume provider credits
- server commands can start background processes and open the browser

Prefer `finalrun suite <path>` over `finalrun test --suite <path>`, but mention that `finalrun test --suite <path>` remains supported for compatibility.

## Command Reference

### Validation

- `finalrun check [selectors...]`
  - validates the `.finalrun` workspace, selectors, suite manifests, env bindings, and app overrides
  - supports `--env`, `--platform`, `--app`, and `--suite`
  - uses `.finalrun/config.yaml` `env` when `--env` is omitted

### Execution

- `finalrun test [selectors...]`
  - runs one or more specs from `.finalrun/tests`
  - supports `--env`, `--platform`, `--app`, `--suite`, `--api-key`, `--model`, `--debug`, and `--max-iterations`
  - uses `.finalrun/config.yaml` `env` and `model` when those flags are omitted
  - validates before execution starts
- `finalrun suite <suitePath>`
  - runs one suite manifest from `.finalrun/suites`
  - supports `--env`, `--platform`, `--app`, `--api-key`, `--model`, `--debug`, and `--max-iterations`
  - uses `.finalrun/config.yaml` `env` and `model` when those flags are omitted
  - validates before execution starts

### Diagnostics

- `finalrun doctor`
  - checks local Android and iOS host readiness
  - supports `--platform`

### Reports

- `finalrun runs`
  - lists local run artifacts for the current workspace
  - supports `--json`
- `finalrun start-server`
  - starts or reuses the local report UI for the current workspace
  - supports `--port` and `--dev`
- `finalrun report serve`
  - compatibility alias for `finalrun start-server`
  - supports `--port` and `--dev`

Explicit CLI flags override `.finalrun/config.yaml` defaults.

## Common CLI Flags

- `--env <name>`
  - used by `check`, `test`, and `suite`
  - selects `.finalrun/env/<name>.yaml`
- `--platform <android|ios>`
  - used by `check`, `test`, `suite`, and `doctor`
  - required when platform cannot be inferred from context or app override
- `--app <path>`
  - used by `check`, `test`, and `suite`
  - `.apk` implies Android and `.app` implies iOS
- `--model <provider/model>`
  - used by `test` and `suite`
  - required unless `.finalrun/config.yaml` already defines `model`
- `--api-key <key>`
  - used by `test` and `suite`
  - overrides provider-specific environment variables
- `--debug`
  - used by `test` and `suite`
  - enables debug logging
- `--max-iterations <n>`
  - used by `test` and `suite`
  - caps execution iterations before the run aborts
- `--suite <path>`
  - used by `check` and `test`
  - on `test`, remains a compatibility path; prefer `finalrun suite <path>`
- `--port <n>`
  - used by `start-server` and `report serve`
- `--dev`
  - used by `start-server` and `report serve`
  - runs the report UI in development mode

## Supported Providers and Models

- Supported providers are `openai`, `google`, and `anthropic`.
- Use `openai/...` models from the GPT-5 family and above.
- Use `google/...` models from the Gemini 3 family and above.
- Use `anthropic/...` models from the Claude Sonnet 4 / Opus 4 families and above.
- Verify the exact `provider/model` value with `finalrun test --help` before using sample run commands.

## Common Workflows

Install and verify the CLI:

```sh
npm install -g @finalrun/finalrun-agent
finalrun --help
finalrun doctor
```

Validate an existing workspace:

```sh
finalrun check --env dev
```

Run one spec after validation:

```sh
finalrun check auth/login.yaml --env dev --platform android
finalrun test auth/login.yaml --env dev --platform android --model google/gemini-3-flash-preview
```

Run one suite after validation:

```sh
finalrun check --suite smoke.yaml --env dev --platform ios
finalrun suite smoke.yaml --env dev --platform ios --model anthropic/claude-3-7-sonnet
```

Inspect recent runs:

```sh
finalrun runs
```

Open the report UI:

```sh
finalrun start-server
```

Discover current command and model help:

```sh
finalrun --help
finalrun test --help
finalrun suite --help
```

## Troubleshooting

Diagnose from the actual CLI output first. Do not guess.

- Missing `.finalrun/`
  - explain that FinalRun must run from a repository containing `.finalrun/`
- Missing `.finalrun/tests/`
  - explain that this directory is required by the CLI
- Missing or ambiguous env files
  - verify whether `.finalrun/env/` exists
  - if multiple env files exist and the selection is ambiguous, tell the user to choose `--env <name>` explicitly
- Unknown env bindings
  - explain which `${variables.*}` or `${secrets.*}` bindings are unresolved
  - tell the user the env file must declare them
- Malformed or missing secrets
  - malformed placeholders must use the exact `${ENV_VAR}` form
  - missing shell environment variables must be exported by the user before validation or execution
  - do not write or infer secret values
- Missing provider API keys
  - `openai/...` uses `OPENAI_API_KEY`
  - `google/...` uses `GOOGLE_API_KEY`
  - `anthropic/...` uses `ANTHROPIC_API_KEY`
  - if missing, tell the user the exact variable they must set or that they must pass `--api-key`
- Invalid `.finalrun/config.yaml`
  - point to the YAML or config error directly
- Selector and suite resolution failures
  - `finalrun test auth/login.yaml` resolves from `.finalrun/tests/auth/login.yaml`
  - `finalrun suite smoke.yaml` resolves from `.finalrun/suites/smoke.yaml`
  - explicit `.finalrun/tests/...` and `.finalrun/suites/...` paths still work
- App override and platform mismatch
  - `.apk` overrides require Android
  - `.app` overrides require iOS
  - tell the user to fix the path or `--platform` mismatch instead of ignoring it
- Host readiness issues
  - use `finalrun doctor` as the default local environment diagnostic

## Coordination with `generate-finalrun-test`

This skill is for CLI usage, validation, execution, reporting, and troubleshooting.

If the user asks to:

- create a new YAML test
- update a suite manifest
- add or change `.finalrun/env/*.yaml` bindings
- plan a new test flow

route that work to `generate-finalrun-test`.

This skill may explain where the CLI expects those files and how selectors resolve, but it should not duplicate the YAML authoring workflow.
