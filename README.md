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

### Fast Local Iteration

Use this while editing local code. It resolves workspace packages from source so changes in `packages/common`, `packages/device-node`, `packages/goal-executor`, and `packages/cli` are picked up on the next run.

```sh
npm run dev:cli -- \
  --api-key=<YOUR_API_KEY> \
  --model=<provider/model> \
  --file=/absolute/path/to/goal.md
```

Example model values:

- `openai/gpt-4o`
- `google/gemini-2.0-flash`
- `anthropic/claude-3-7-sonnet-latest`

You can also pass the goal inline instead of using `--file`:

```sh
npm run dev:cli -- \
  --api-key=<YOUR_API_KEY> \
  --model=<provider/model> \
  "Tap on the Login button"
```

### Compiled Output Flow

Use this when you want to run the built JavaScript output instead of source files:

```sh
npm run build
node packages/cli/dist/bin/finalrun.js \
  --api-key=<YOUR_API_KEY> \
  --model=<provider/model> \
  --file=/absolute/path/to/goal.md
```

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
npm run build
npm test
```

Notes:

- `npm test` rebuilds first, then runs workspace tests from compiled `dist/**/*.test.js`.
- `npm run dev:cli -- --help` is the fastest check that the CLI, workspace resolution, and script wiring are intact.

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

### Missing API key

Symptom:

```text
API key is required. Provide via --api-key flag or API_KEY / OPENAI_API_KEY env variable.
```

Fix: pass `--api-key=<YOUR_API_KEY>` in your local run command.

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
