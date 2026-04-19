# Configuration

FinalRun workspaces are configured through `.finalrun/config.yaml` and optional per-environment files under `.finalrun/env/`.

## Workspace Layout

```text
my-app/                        # workspace root
  .env                         # optional; API keys and secrets (do not commit)
  .env.dev                     # optional; env-specific secrets (do not commit)
  .finalrun/
    config.yaml                # workspace configuration
    tests/                     # YAML test specs (required)
      smoke.yaml
      auth/
        login.yaml
    suites/                    # suite manifests (optional)
      auth_smoke.yaml
    env/                       # environment bindings (optional)
      dev.yaml
```

## `.finalrun/config.yaml`

The workspace config defines defaults used by the CLI when flags are omitted.

| Field | Description |
|---|---|
| `app.name` | Human-readable app name (optional) |
| `app.packageName` | Android package identifier (e.g. `com.example.myapp`) |
| `app.bundleId` | iOS bundle identifier (e.g. `com.example.myapp`) |
| `env` | Default environment name (used when `--env` is omitted) |
| `model` | Default AI model in `provider/model` format (used when `--model` is omitted) |
| `reasoning` | Default reasoning effort for all features: `minimal`, `low`, `medium`, or `high`. `minimal` is OpenAI-only. |
| `features.<name>.model` | Per-feature model override in `provider/model` format. |
| `features.<name>.reasoning` | Per-feature reasoning effort override. |

At least one of `app.packageName` or `app.bundleId` is required.

Valid feature names: `planner`, `grounder`, `visual-grounder`, `scroll-index-grounder`, `input-focus-grounder`, `launch-app-grounder`, `set-location-grounder`.

### Example

```yaml
app:
  name: MyApp
  packageName: com.example.myapp
  bundleId: com.example.myapp
env: dev
model: google/gemini-3-flash-preview
reasoning: medium

# Optional — unlisted features inherit the default model and reasoning.
features:
  planner:
    model: anthropic/claude-opus-4-7
    reasoning: high
  scroll-index-grounder:
    reasoning: low
```

### Per-Feature Overrides

The `features:` block lets you tune each LLM call independently. Each feature drives a distinct prompt:

- `planner` — decides the next user action from the current screen.
- `grounder` — picks the UI element for an action.
- `visual-grounder` — visual fallback when text grounding fails.
- `scroll-index-grounder`, `input-focus-grounder`, `launch-app-grounder`, `set-location-grounder` — specialized grounders for their respective actions.

Both `model` and `reasoning` are optional per feature. Any unset field falls back to the workspace-level default (`model:` / `reasoning:`), and any unlisted feature inherits both defaults.

If features target **different providers** (e.g. planner on Anthropic, grounder on Google), you must set each provider's env var (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`) — see [environment.md](environment.md). The `--api-key` CLI flag only works when a single provider is active across all features.

## App Identity

FinalRun needs to know which app to launch on the device. The app identity is resolved in this order:

1. **`--app <path>`** CLI flag (highest priority)
2. **`.finalrun/env/<name>.yaml`** `app` block (per-environment override)
3. **`.finalrun/config.yaml`** `app` block (workspace default)

### The `--app` Flag

Pass a local app binary to override the configured app identity:

```sh
finalrun test smoke.yaml --platform android --app path/to/your.apk
finalrun test smoke.yaml --platform ios --app path/to/YourApp.app
```

The CLI:
- Extracts the package name (Android) or bundle ID (iOS) from the binary
- Infers the platform from the file extension (`.apk` → Android, `.app` → iOS)
- Validates that the binary matches the `--platform` flag if both are provided

### Per-Environment App Overrides

If your app uses different identifiers per environment (e.g. `.staging` suffix), override the app identity in `.finalrun/env/<name>.yaml`:

```yaml
# .finalrun/env/staging.yaml
app:
  packageName: com.example.myapp.staging
  bundleId: com.example.myapp.staging
```

The default identity in `.finalrun/config.yaml` is used for any environment that doesn't define its own `app` block.

## Environment Bindings

Environment files (`.finalrun/env/<name>.yaml`) can contain:

| Key | Description |
|---|---|
| `app` | Per-environment app identity override |
| `secrets` | Placeholder references like `${ENV_VAR}` for sensitive values |
| `variables` | Non-sensitive values (strings, numbers, booleans) |

See [environment.md](environment.md) for the full guide on secrets, dotenv load order, and API keys.
