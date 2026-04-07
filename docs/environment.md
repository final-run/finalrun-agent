# Environment Variables and Secrets

This guide covers the full details of how FinalRun resolves environment variables, secrets, and AI provider API keys. For a quick summary, see the [README](../README.md#environment--secrets). For workspace config and app identity, see [configuration.md](configuration.md).

## Where to Put Files

**Workspace root** is the folder that contains `.finalrun/`. FinalRun finds it by walking up from your shell's current directory, so dotenv paths are anchored to that root (not to `cwd` when you run from a subfolder).

```text
my-app/                    # workspace root
  .env                     # optional; shared defaults (do not commit)
  .env.dev                 # optional; values when using env name "dev" (do not commit)
  .finalrun/
    config.yaml
    env/
      dev.yaml             # declares placeholder bindings only
    tests/
      smoke.yaml
```

### Dotenv files (secrets and provider keys)

- **`.env`** — optional; values merged for all runs (see load order below).
- **`.env.<name>`** — optional; used when that environment is active (e.g. `.env.dev` for `--env dev` or `env: dev` in `.finalrun/config.yaml`). The name matches `.finalrun/env/<name>.yaml`.

### Binding files (`.finalrun/env/<name>.yaml`)

Declares `secrets` as placeholders like `${TEST_USER_EMAIL}` and `variables` as plain values. The CLI resolves each `secrets` placeholder from the shell environment and from workspace-root `.env` / `.env.<name>`. **Do not put real secrets inside this YAML.**

```yaml
secrets:
  email: ${TEST_USER_EMAIL}
  password: ${TEST_USER_PASSWORD}

variables:
  locale: en-US
```

## Load Order

For a resolved environment name `N`, the CLI loads variables in this order:

1. **`.env.N`** — environment-specific dotenv file
2. **`.env`** — fills in any keys not already set
3. **`process.env`** — wins if the same name is set in both a file and the shell environment

This single workspace-root dotenv setup is used for:

- Resolving **`${secrets.*}`** references defined in `.finalrun/env/*.yaml`.
- Reading **AI provider API keys** (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`) for `finalrun test` and `finalrun suite`.

When no FinalRun environment is in use (env-free workspace), the CLI does not require a `.env.N` file for YAML bindings; you can still use `process.env` or `.env` for keys if applicable.

## AI Provider API Keys

FinalRun resolves API keys by provider prefix:

| Provider prefix | Environment variable |
|---|---|
| `openai/...` | `OPENAI_API_KEY` |
| `google/...` | `GOOGLE_API_KEY` |
| `anthropic/...` | `ANTHROPIC_API_KEY` |

Keys are read from `process.env` and from workspace-root `.env` / `.env.<name>`. You can also pass `--api-key` to override.

## Git: Keep Secrets Out of the Repo

**Do not commit** `.env` files. Add the following to your app repository's `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

This ignores `.env`, `.env.dev`, `.env.staging`, and similar while keeping `.env.example` tracked as a template.

## Platform Prerequisites (Detailed)

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
