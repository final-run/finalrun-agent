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

### Supported Providers

Use any of these prefixes in the `provider/model` format:

- `openai/<model>` (e.g. `openai/gpt-5.4-mini`)
- `google/<model>` (e.g. `google/gemini-3-flash-preview`)
- `anthropic/<model>` (e.g. `anthropic/claude-opus-4-7`)

Model names are passed straight to the provider — consult the provider's docs for which models accept reasoning effort.

### Reasoning Levels by Provider

| Provider | Accepted `reasoning` values |
|---|---|
| `openai` | `minimal`, `low`, `medium`, `high` |
| `google` | `low`, `medium`, `high` |
| `anthropic` | `low`, `medium`, `high` |

Setting `reasoning: minimal` on a Google- or Anthropic-routed feature fails at run time with a message naming the offending feature.

When neither workspace `reasoning:` nor a per-feature `reasoning:` is set, FinalRun applies built-in fallbacks:

- `planner` → `medium`
- every grounder (`grounder`, `visual-grounder`, `scroll-index-grounder`, `input-focus-grounder`, `launch-app-grounder`, `set-location-grounder`) → `low`

### Supported Configurations

Three shapes are supported. Pick the simplest one that fits.

**1. One model, one reasoning level (simplest).** Every feature uses the same model and effort:

```yaml
model: openai/gpt-5.4-mini
reasoning: low
```

**2. Same provider, per-feature reasoning tuning.** One API key, one provider, but effort tuned per feature:

```yaml
model: openai/gpt-5.4-mini
reasoning: low

features:
  planner:
    reasoning: high              # planner only — keeps the workspace model
  scroll-index-grounder:
    reasoning: minimal           # cheap fast grounding
  # unlisted features inherit model + reasoning from the top
```

**3. Mixed providers across features.** Different providers for different features:

```yaml
model: google/gemini-3-flash-preview   # default for anything unlisted
reasoning: medium

features:
  planner:
    model: anthropic/claude-opus-4-7
    reasoning: high
  grounder:
    model: openai/gpt-5.4-mini
    reasoning: minimal
```

Mixed-provider mode requires **every** referenced provider's env var to be set (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` — see [environment.md](environment.md)). The `--api-key` CLI flag is rejected in this mode.

### Per-Feature Overrides

The `features:` block lets you tune each LLM call independently. Each feature drives a distinct prompt:

- `planner` — decides the next user action from the current screen.
- `grounder` — picks the UI element for an action.
- `visual-grounder` — visual fallback when text grounding fails.
- `scroll-index-grounder`, `input-focus-grounder`, `launch-app-grounder`, `set-location-grounder` — specialized grounders for their respective actions.

Both `model` and `reasoning` are optional per feature. Any unset field falls back to the workspace-level default (`model:` / `reasoning:`), and any unlisted feature inherits both defaults.

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
