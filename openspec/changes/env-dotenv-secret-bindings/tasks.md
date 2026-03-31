## 1. Wire CliEnv to workspace root and resolved env name

- [x] 1.1 In `packages/cli/src/checkRunner.ts`, load dotenv with `resolvedEnvironment.envName` when `usesEmptyBindings` is false, and `cwd: workspace.rootDir`.
- [x] 1.2 When `usesEmptyBindings` is true, keep dotenv disabled for this path so env-free workspaces behave unchanged.

## 2. Same root for test/suite API key dotenv

- [x] 2.1 In `packages/cli/bin/finalrun.ts`, pass `cwd: workspace.rootDir` into `runtimeEnv.load` so provider keys and YAML secrets use the same workspace-root `.env` / `.env.<name>` files.

## 3. Tests

- [x] 3.1 Test: `.finalrun/env/dev.yaml` `secrets` + `<workspace_root>/.env.dev`, var not in `process.env`.
- [x] 3.2 Test: nested cwd still loads `<workspace_root>/.env.dev`.

## 4. Verification

- [x] 4.1 Run CLI package tests and fix regressions.
