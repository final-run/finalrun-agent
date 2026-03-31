## Why

Environment YAML under `.finalrun/env/<name>.yaml` maps logical secret keys to OS env vars using placeholders like `${API_KEY}`. The CLI was resolving those placeholders without reading `.env` files during validation (`finalrun check` and the validation phase of `finalrun test` / `finalrun suite`), so users saw "references missing environment variable" even when values lived in `.env.<name>`. This change loads those files from a **single, predictable place**: the **workspace root** (the directory that contains `.finalrun/`). The same root is used when `finalrun test` / `finalrun suite` loads provider API keys, so there is one dotenv location to remember—not one path for secrets and another for keys.

## What Changes

- When a FinalRun environment name is resolved (e.g. `dev` from `.finalrun/env/dev.yaml` or `--env dev`), the CLI SHALL load variables from `<workspace_root>/.env.<name>` (and merge `<workspace_root>/.env` per existing `CliEnv` rules), then overlay `process.env`, before resolving `secrets.*` placeholders.
- `finalrun test` / `finalrun suite` SHALL use that same workspace root when loading dotenv for provider API keys (`OPENAI_API_KEY`, etc.), anchored with `workspace.rootDir` so nested `cwd` still works.
- If no environment is selected (empty bindings / no env file), named `.env.<name>` loading for YAML secrets SHALL NOT be required; env-free behavior stays unchanged.

## Capabilities

### New Capabilities

- `environment-secret-bindings`: Defines how the CLI loads workspace-root `.env.<name>` and uses those values to satisfy `secrets` in `.finalrun/env/<name>.yaml`, with one shared workspace root for related dotenv loading.

### Modified Capabilities

- _(none — existing `simplified-run-invocation` spec does not define environment file or secret resolution behavior.)_

## Impact

- **Code**: `packages/cli/src/checkRunner.ts`; `packages/cli/bin/finalrun.ts` (`cwd: workspace.rootDir` for `CliEnv.load`); `packages/cli/src/env.ts` unchanged except as consumer of `cwd`.
- **Tests**: CLI tests for `.env.<name>` at workspace root + secrets in `.finalrun/env/<name>.yaml`.
- **Dependencies**: None (existing `dotenv`).
