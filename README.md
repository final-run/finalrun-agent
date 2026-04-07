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

---

`finalrun-agent` is an AI-driven CLI that tests your Android and iOS apps using natural language. You write a plain-English test in YAML, FinalRun launches your app on an emulator or simulator, uses an AI model (Gemini, GPT, or Claude) to see the screen and perform each step — tapping, swiping, typing — and produces a pass/fail report with video and device logs.

## Watch Demo

[![Watch the FinalRun demo](https://img.youtube.com/vi/q6CFoN-ohT4/maxresdefault.jpg)](https://www.youtube.com/watch?v=q6CFoN-ohT4)

Watch the demo on YouTube: https://www.youtube.com/watch?v=q6CFoN-ohT4

## Install

Run the installer to set up everything — Node.js, the CLI, skills, and platform tools:

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

The installer checks for Node.js (installs via nvm if missing), installs the `finalrun` CLI globally, adds FinalRun skills for Claude Code / Codex, and walks you through Android and iOS tool setup.

## Prerequisites

> **Tip:** The install script handles most of these automatically. The details below are for manual setup.

**Required:**
- Node.js `>=20` and `npm`
- A built app binary (`.apk` for Android, `.app` for iOS) to test against

**Android:**
- [Android Studio](https://developer.android.com/studio) (provides `adb`, `emulator`, and SDK tools)
  After installing, add the SDK tools to your shell profile (`~/.zshrc` or `~/.bashrc`):
  ```sh
  export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS default
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
  ```
- `scrcpy` — install via `brew install scrcpy` (macOS) or see [scrcpy docs](https://github.com/Genymobile/scrcpy)

**iOS (macOS only):**
- [Xcode](https://developer.apple.com/xcode/) with Command Line Tools (`xcode-select --install`)

Run `finalrun doctor` to verify your host is ready:

```sh
finalrun doctor
finalrun doctor --platform android
finalrun doctor --platform ios
```

See [docs/environment.md](docs/environment.md#platform-prerequisites-detailed) for the full list of required and optional tools.

## Writing Your First Test

FinalRun ships [skills](https://github.com/vercel-labs/skills) that let your AI coding agent generate tests, validate workspaces, and run tests — all from chat.

### Generate tests with `/finalrun-generate-test`

This skill reads your app's source code, infers the app identity, and generates complete test specs with setup, steps, and expected state — organized by feature folder.

> `/finalrun-generate-test` Generate tests for the authentication feature — cover login with valid credentials, login with wrong password, and logout

The agent will:
1. Read your source code to understand the UI and infer the app's package name / bundle ID
2. Set up `.finalrun/config.yaml` and environment bindings in `.finalrun/env/`
3. Propose a test plan with file paths and cleanup strategy for your approval
4. Generate YAML specs under `.finalrun/tests/auth/` and a suite under `.finalrun/suites/`
5. Run `finalrun check` to validate everything

> `/finalrun-generate-test` Add a smoke test that verifies the app launches and the home screen is visible

### Run tests with `/finalrun-use-cli`

Once your tests are generated, use this skill to validate and run them.

> `/finalrun-use-cli` Run the auth tests on Android

## API Keys (BYOK — Bring Your Own Key)

FinalRun uses your own AI provider API key to run tests. Create a `.env` file at your workspace root (the folder containing `.finalrun/`):

```sh
cp .env.example .env    # then fill in your key
```

Or create one directly:

```sh
# Use the key matching your chosen provider
echo "GOOGLE_API_KEY=your-key-here" > .env
```

| Provider | Environment variable |
|---|---|
| `google/...` | `GOOGLE_API_KEY` |
| `openai/...` | `OPENAI_API_KEY` |
| `anthropic/...` | `ANTHROPIC_API_KEY` |

You can also pass `--api-key` on the command line to override. Keys are read from `process.env` and workspace-root `.env` / `.env.<name>` files — see [Environment & Secrets](#environment--secrets) for details.

> Test runs consume API tokens from your configured provider — standard API billing applies.

## Running Tests

Run a single test:

```sh
finalrun test smoke.yaml --platform android --model google/gemini-3-flash-preview
```

Run a suite:

```sh
finalrun suite auth_smoke.yaml --platform android --model google/gemini-3-flash-preview
```

For more details see:
- [YAML Tests](docs/yaml-tests.md) — test format, fields, suites, and environment placeholders
- [CLI Reference](docs/cli-reference.md) — all commands, flags, and report tools
- [Configuration](docs/configuration.md) — workspace config, app identity, `--app` flag, and per-environment overrides

## Environment & Secrets

Put your API keys and test credentials in a `.env` file at the workspace root (the folder containing `.finalrun/`). Use `.finalrun/env/<name>.yaml` for placeholder bindings only — never put real secrets in YAML.

```sh
cp .env.example .env    # then fill in your keys
```

Add `.env` and `.env.*` to your `.gitignore` to keep secrets out of version control.

For the full guide — load order, per-environment files, and binding syntax — see [docs/environment.md](docs/environment.md).

## Troubleshooting

**`Error: No .finalrun/ workspace found`**
FinalRun looks for `.finalrun/` by walking up from your current directory. Make sure you're inside your app repo and `.finalrun/tests/` exists.

**`Error: API key not configured`**
Set the matching environment variable for your model provider. For `google/...`, set `GOOGLE_API_KEY` in your `.env` or shell. See [Supported AI Providers](#supported-ai-providers).

**`Error: No Android emulator running`**
Start an emulator with `emulator -avd <name>` or launch one from Android Studio. Run `finalrun doctor --platform android` to verify.

**`Error: scrcpy not found` / `adb not found`**
Install missing Android tools: `brew install scrcpy android-platform-tools` (macOS). Run `finalrun doctor` to check.

**`Unresolved ${secrets.*} placeholder`**
The referenced variable isn't set. Check that it's declared in `.finalrun/env/<name>.yaml` and the actual value is in `.env` or your shell environment.

**`Error: App path invalid`**
The `--app` flag requires a path to an existing `.apk` file or `.app` directory. Verify the path and ensure the file matches the target platform.

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
