# finalrun-ts

TypeScript monorepo for the FinalRun local CLI. It detects devices, starts the mobile driver, calls an LLM to plan actions, and executes those actions against Android or iOS targets.

## Repo Overview

- `packages/common`: shared types, constants, models, and logging utilities.
- `packages/device-node`: device detection, app install flows, gRPC driver setup, and platform-specific device management.
- `packages/goal-executor`: AI-driven planning and action execution.
- `packages/cli`: terminal entrypoint and local developer workflow.
- `resources/`: local driver artifacts used at runtime.
  - `resources/android/app-debug.apk`
  - `resources/android/app-debug-androidTest.apk`
  - `resources/ios/finalrun-ios.zip`
  - `resources/ios/finalrun-ios-test-Runner.zip`
- `proto/`: protobuf definitions for the driver protocol, currently `proto/finalrun/driver.proto`.

## Prerequisites

- Node.js `>=20`
- `npm`
- Android development:
  - `adb` available via `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or your shell `PATH`
- iOS simulator development when needed:
  - `xcrun` available from Xcode command line tools
- Runtime assets already present under `resources/android` and `resources/ios`

## Install

From the repo root:

```sh
npm install
```

## Build

Build all workspace packages:

```sh
npm run build
```

This compiles each package into its own `packages/*/dist` directory. After a successful compiled build, the CLI entrypoint is:

```sh
node packages/cli/dist/bin/finalrun.js --help
```

## Clean

Remove compiled output:

```sh
npm run clean
```

`clean` removes `packages/*/dist` only. It does not remove TypeScript incremental build metadata.

If `npm run build` reports success but a package is still missing `dist/index.js` or `packages/cli/dist/bin/finalrun.js`, force a rebuild instead of assuming the code is broken:

```sh
npx tsc --build --force \
  packages/common/tsconfig.json \
  packages/device-node/tsconfig.json \
  packages/goal-executor/tsconfig.json \
  packages/cli/tsconfig.json
```

## Run

The public CLI is now spec-first. `finalrun` expects a repo-local `.finalrun/` workspace with versioned YAML specs. Environment files are optional and are only needed when specs use `${variables.*}` or `${secrets.*}` bindings.

### Workspace Layout

```text
.finalrun/
  tests/
    add_and_delete_language.yaml
    auth/
      login.yaml
  env/                  # optional
    dev.yaml
    staging.yaml
  artifacts/
```

- `.finalrun/tests/`: committed human-readable specs
- `.finalrun/env/`: optional committed environment config
- `.finalrun/artifacts/`: generated local run output, not committed

### Environment Files

Environment YAML is intentionally minimal in v1. Only `secrets` and `variables` are supported.

```yaml
secrets:
  email: ${OTP_USER_EMAIL}
  otp: ${OTP_USER_OTP}

variables:
  language: Spanish
  locale: es-ES
```

- `secrets.*` map FinalRun logical keys to shell or CI environment variables
- `variables.*` hold non-sensitive reusable values
- legacy `app` keys are rejected

### Test Specs

Specs stay human-readable and environment-agnostic.

```yaml
name: login_and_verify_feed
description: Verify that a user can log in and reach the main feed.

steps:
  - Launch the app.
  - Enter ${secrets.email} on the login screen.
  - Enter ${secrets.otp} on the OTP screen.
  - Verify the main feed is visible.
```

- `${variables.*}` resolve before planning
- `${secrets.*}` stay tokenized in planner input and resolve only at execution time

### Fast Local Iteration

Use this while editing local code. It resolves workspace packages from source so changes in `packages/common`, `packages/device-node`, `packages/goal-executor`, and `packages/cli` are picked up on the next run.

`--env` is optional. When omitted, FinalRun uses empty bindings if `.finalrun/env/` is absent or contains no env files. If env files are present, FinalRun uses `.finalrun/env/dev.yaml` when it exists, otherwise it falls back to the only env file when exactly one exists. If multiple non-`dev` env files exist, the CLI stops and asks you to pass `--env <name>`.

Validate the workspace before executing:

```sh
npm run dev:cli -- check
```

Run all discovered specs:

```sh
npm run dev:cli -- test --api-key=<YOUR_API_KEY> --model=openai/gpt-4o
```

If you rely on environment variables instead of `--api-key`, FinalRun uses the key that matches `--model`:

- `openai/...` -> `OPENAI_API_KEY`, then `API_KEY`
- `google/...` -> `GOOGLE_API_KEY`, then `API_KEY`
- `anthropic/...` -> `ANTHROPIC_API_KEY`, then `API_KEY`

It does not fall through to another provider's env var.

Run one spec or a glob:

```sh
npm run dev:cli -- test .finalrun/tests/auth/login.yaml --env staging --platform android --api-key=<YOUR_API_KEY>
npm run dev:cli -- test .finalrun/tests/auth/** --env staging --platform ios --api-key=<YOUR_API_KEY>
```

Run against a local build artifact:

```sh
npm run dev:cli -- test --env staging --platform android --app /absolute/path/to/app.apk --api-key=<YOUR_API_KEY>
npm run dev:cli -- test --env staging --platform ios --app /absolute/path/to/My.app --api-key=<YOUR_API_KEY>
```

Example model values:

- `openai/gpt-4o`
- `google/gemini-2.0-flash`
- `anthropic/claude-3-7-sonnet-latest`

### Compiled Output Flow

Use this when you want to run the built JavaScript output instead of source files:

```sh
npm run build
node packages/cli/dist/bin/finalrun.js check
node packages/cli/dist/bin/finalrun.js test --api-key=<YOUR_API_KEY> --model=openai/gpt-4o
```

### Artifacts

Each run writes a timestamped directory under `.finalrun/artifacts/`:

```text
.finalrun/artifacts/<run-id>/
  index.html
  summary.json
  runner.log
  tests/
    <spec-id>/
      result.json
      steps/
        001.json
      screenshots/
        001.jpg
```

The static HTML report uses a two-pane timeline/detail layout with an analysis banner, per-step reasoning, screenshots, trace data, and raw artifact links.

## Debug Loop

- Preferred loop while developing: `npm run dev:cli -- ...`
- If you specifically want `dist/` to stay updated while you keep using compiled-package workflows, run this in a second terminal:

```sh
npm run dev:watch
```

`dev:watch` runs a TypeScript project build in watch mode across all workspace packages.

## Verification

Sanity-check the local setup with:

```sh
npm run dev:cli -- --help
npm run dev:cli -- check
npm run build
npm test
```

Notes:

- `npm test` rebuilds first, then runs workspace tests from compiled `dist/**/*.test.js`.
- `npm run dev:cli -- check` is the fastest repo-runner validation loop once `.finalrun/` exists.

## Troubleshooting

### Build succeeded but `dist/index.js` is missing

Cause: stale TypeScript incremental build metadata can make `tsc` skip emitting files even after `dist/` was cleaned.

Fix:

```sh
npx tsc --build --force \
  packages/common/tsconfig.json \
  packages/device-node/tsconfig.json \
  packages/goal-executor/tsconfig.json \
  packages/cli/tsconfig.json
```

### Missing `.finalrun` workspace

Symptom:

```text
Could not find a .finalrun workspace. Run the CLI from a repository containing .finalrun/.
```

Fix: create `.finalrun/tests/`, then run the CLI from that repository or any nested directory inside it. Add `.finalrun/env/` only if your specs use `${variables.*}` or `${secrets.*}` bindings.

### Missing API key

Symptom:

```text
API key is required. Provide via --api-key or API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY / ANTHROPIC_API_KEY.
```

Fix: pass `--api-key=<YOUR_API_KEY>` in your local run command.

If multiple provider-specific env vars are exported in your shell, `--model` decides which one FinalRun reads.

### Unresolved secret placeholders

Symptom:

```text
.finalrun/env/dev.yaml secrets.email references missing environment variable OTP_USER_EMAIL.
```

Fix: export the referenced environment variable locally or inject it through CI before running `finalrun check` or `finalrun test`.

### Multiple platforms detected

Symptom:

```text
Multiple platforms are available. Choose --platform android or --platform ios.
```

Fix: pass `--platform android` or `--platform ios` explicitly when both Android and iOS devices are connected.

### `adb` not found

Android flows require `adb`. Make sure one of these is true:

- `ANDROID_HOME` points to an SDK that contains `platform-tools/adb`
- `ANDROID_SDK_ROOT` points to an SDK that contains `platform-tools/adb`
- `adb` is already available on your `PATH`

### Missing iOS runner archives or `xcrun`

iOS simulator flows require:

- `resources/ios/finalrun-ios.zip`
- `resources/ios/finalrun-ios-test-Runner.zip`
- `xcrun` from Xcode command line tools

If any of these are missing, iOS driver startup will fail before the goal can run.

## Useful Commands

```sh
npm install
npm run build
npm run clean
npm run dev:cli -- --help
npm run dev:watch
npm test
npm run generate:proto
```

Use `npm run generate:proto` only when `proto/finalrun/driver.proto` changes and you need to refresh generated driver bindings.
