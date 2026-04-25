<p align="center">
  <a href="https://finalrun.app/">
    <img alt="FinalRun logo" height="90" src="https://raw.githubusercontent.com/final-run/finalrun-agent/main/.github/resources/Logo.png">
  </a>
</p>

<p align="center">
  <a aria-label="Latest GitHub release" href="https://github.com/final-run/finalrun-agent/releases/latest" target="_blank">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/final-run/finalrun-agent?style=flat-square&label=release&labelColor=000000&color=4630EB" />
  </a>
  <a aria-label="License: Apache-2.0" href="LICENSE">
    <img alt="License: Apache-2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=flat-square&color=33CC12" />
  </a>
</p>

<p align="center">
  <a aria-label="FinalRun website" href="https://finalrun.app/"><b>finalrun.app</b></a>
  &ensp;•&ensp;
  <a aria-label="FinalRun documentation" href="https://docs.finalrun.app/">Docs</a>
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

## Demo

<p align="center">
  <img alt="FinalRun demo" src="https://raw.githubusercontent.com/final-run/finalrun-agent/main/.github/resources/finalrun-demo.gif" />
</p>


## Install

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

Downloads a self-contained `finalrun` binary into `~/.finalrun/bin/`, adds it to your PATH, downloads the per-platform runtime tarball, prompts for Android/iOS, installs host tools (`scrcpy`, Xcode CLT, `applesimutils`), and offers to install the AI agent skills. No Node.js required.

For CI / non-interactive environments — install only the binary, skip the runtime tarball and prompts:

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash -s -- --ci
```

CI environments (`CI=1` set in env) get this behavior automatically even without the flag.

After install, run `finalrun doctor` to verify host readiness.


## Write and Run Your First Test Using AI Agents

FinalRun ships [skills](https://github.com/vercel-labs/skills) that let your AI coding agent generate tests, validate workspaces, and run tests — all from chat.

### Generate tests

`/finalrun-generate-test` skill reads your app's source code, infers the app identity, and generates complete test specs with setup, steps, and expected state — organized by feature folder.

Example:

```sh
/finalrun-generate-test Generate tests for the authentication feature — cover login with valid credentials, login with wrong password, and logout
```

The agent will:
1. Read your source code to understand the UI and infer the app's package name / bundle ID
2. Set up `.finalrun/config.yaml` and environment bindings in `.finalrun/env/`
3. Propose a test plan with file paths and cleanup strategy for your approval
4. Generate YAML specs under `.finalrun/tests/auth/` and a suite under `.finalrun/suites/`
5. Run `finalrun check` to validate everything

### Run tests

`/finalrun-generate-test` skill validates and run the test once your tests are generated.

Example:

```sh
/finalrun-use-cli Run the auth tests on Android
```

### Debug and fix failing tests

`/finalrun-test-and-fix` skill orchestrates the full **generate → run → diagnose → fix** loop. It authors tests via `finalrun-generate-test`, runs them via `finalrun-use-cli`, reads the CLI artifacts (`result.json`, `actions/`, screenshots, `device.log`) on failure, classifies whether the bug is in the **app code** or the **test**, applies the narrowest fix, and re-runs until the run is green.

Example:

```sh
/finalrun-test-and-fix Verify and fix the checkout feature end-to-end on Android
```


## How to auto trigger Finalrun to generate and test once feature development is completed

Add this **[content](docs/autotrigger-finalrun.md)** to your **AGENTS.md** to auto-trigger Finalrun, so you don’t have to explicitly ask your agent to generate and run tests everytime. This will also let your agent fix issues if there is any error while development


## API Keys (BYOK — Bring Your Own Key)

FinalRun uses your own AI provider API key to run tests.

```sh
echo "GOOGLE_API_KEY=your-key-here" > .env
```

| Provider | Environment variable |
|---|---|
| `google/...` | `GOOGLE_API_KEY` |
| `openai/...` | `OPENAI_API_KEY` |
| `anthropic/...` | `ANTHROPIC_API_KEY` |

> Test runs consume API tokens from your configured provider — standard API billing applies.


## Running Tests manually with [CLI](docs/cli-reference.md)

```sh
finalrun test smoke.yaml --platform android --model google/gemini-3-flash-preview
```

```sh
finalrun suite auth_smoke.yaml --platform android --model google/gemini-3-flash-preview
```


## Documentation

Full docs: **[docs.finalrun.app](https://docs.finalrun.app/)**

- [Autotrigger FinalRun tests (AI agents)](docs/autotrigger-finalrun.md) — when coding agents should generate, validate, and run tests after UI work
- [YAML Tests](docs/yaml-tests.md) — test format, fields, suites, and environment placeholders
- [CLI Reference](docs/cli-reference.md) — all commands, flags, and report tools
- [Configuration](docs/configuration.md) — workspace config, app identity, `--app` flag, and per-environment overrides
- [Environment & Secrets](docs/environment.md) — dotenv load order, provider keys, and platform prerequisites
- [Troubleshooting](docs/troubleshooting.md) — common errors and fixes


## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for monorepo structure, build commands, and contributor guidelines.

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [CHANGELOG.md](CHANGELOG.md)
- [LICENSE](LICENSE)
