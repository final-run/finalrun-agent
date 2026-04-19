# CLI Reference

The `finalrun` CLI is the main interface for validating workspaces, running tests, and inspecting reports.

## Getting Started

| Command | Description |
|---|---|
| `finalrun check` | Validates the `.finalrun` workspace, environment bindings, selectors, and suite manifests. Uses `env` from `.finalrun/config.yaml` when `--env` is omitted. |
| `finalrun doctor` | Checks host readiness for local Android and iOS runs. Supports `--platform` to check one platform. |

## Running Tests

| Command | Description |
|---|---|
| `finalrun test <selectors...>` | Executes one or more YAML specs from `.finalrun/tests`. |
| `finalrun suite <suitePath>` | Executes a suite manifest from `.finalrun/suites`. |

### Common Flags

Flags for `test` and `suite`:

| Flag | Description |
|---|---|
| `--platform <android\|ios>` | Target platform |
| `--model <provider/model>` | AI model (e.g. `google/gemini-3-flash-preview`). Falls back to `.finalrun/config.yaml`. |
| `--env <name>` | Environment name (matches `.finalrun/env/<name>.yaml`). Falls back to config. |
| `--app <path>` | Path to `.apk` or `.app` binary. Overrides the app identity in config. See [configuration.md](configuration.md) for details. |
| `--api-key <key>` | Override the provider API key. Only valid when a single provider is in use across all features; use env vars when features target multiple providers. |
| `--debug` | Enable debug logging. |
| `--max-iterations <n>` | Limit AI action iterations per step. |

CLI flags always take precedence over `.finalrun/config.yaml`.

### Examples

```sh
# Run a single test
finalrun test smoke.yaml --platform android --model google/gemini-3-flash-preview

# Run with a specific app binary
finalrun test smoke.yaml --platform android --app path/to/your.apk

# Run a suite
finalrun suite auth_smoke.yaml --platform ios --model anthropic/claude-sonnet-4-6

# Validate before running
finalrun check --env dev --platform android
```

## Report Commands

| Command | Description |
|---|---|
| `finalrun runs` | Lists local reports from `~/.finalrun/workspaces/<workspace-hash>/artifacts`. |
| `finalrun start-server` | Starts or reuses the local report UI for a workspace. |
| `finalrun server-status` | Shows the current local report server status. |
| `finalrun stop-server` | Stops the local report server. |

All report commands support `--workspace <path>` to target a specific workspace.

## Help

```sh
finalrun --help
finalrun <command> --help
```
