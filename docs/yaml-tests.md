# YAML Tests

FinalRun tests are plain YAML files stored under `.finalrun/tests/`. Each file defines a single test scenario with natural-language steps that the AI agent executes on a real device or emulator.

## Test Fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Stable identifier for the scenario |
| `description` | no | Short human-readable summary |
| `steps` | yes | Ordered natural-language steps executed by the agent. The first items should be idempotent prep that brings the app to a clean starting state. |
| `expected_state` | no | Expected UI state after all steps complete |

## Example

```yaml
name: login_smoke
description: Verify that a user can log in and reach the home screen.

steps:
  - Clear app data.
  - Launch the app.
  - Enter ${secrets.email} on the login screen.
  - Enter ${secrets.password} on the password screen.
  - Tap the login button.

expected_state:
  - The home screen is visible.
  - The user's name appears in the header.
```

## Environment Placeholders

Tests can reference dynamic values using placeholder syntax:

- **`${secrets.*}`** — resolves from OS environment variables and workspace-root `.env` / `.env.<name>` files. Use for credentials and sensitive values.
- **`${variables.*}`** — resolves from non-sensitive values declared in `.finalrun/env/*.yaml`. Use for locale, feature flags, etc.

Both must be declared in `.finalrun/env/<name>.yaml`. See [environment.md](environment.md) for the full guide on load order and dotenv files.

## Suite Manifests

Suite manifests live under `.finalrun/suites/` and group test files into logical collections. Each entry resolves under `.finalrun/tests/`.

```yaml
name: auth_smoke
description: Covers the authentication smoke scenarios.
tests:
  - auth/login.yaml
  - auth/logout.yaml
```

### Suite Fields

| Field | Required | Description |
|---|---|---|
| `name` | yes | Suite identifier |
| `description` | no | Short human-readable summary |
| `tests` | yes | List of test file paths (relative to `.finalrun/tests/`) |

## Running

```sh
# Run a single test
finalrun test auth/login.yaml --platform android --model google/gemini-3-flash-preview

# Run a suite
finalrun suite auth_smoke.yaml --platform android --model google/gemini-3-flash-preview
```

See [cli-reference.md](cli-reference.md) for all available flags.
