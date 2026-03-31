## Context

- `.finalrun/env/<name>.yaml` declares `secrets` as `${ENV_VAR}` placeholders; `readSecrets` resolves them via `runtimeEnv.get(envVar)`.
- `CliEnv.load` reads `.env.<envName>` and `.env` from a configurable directory, then overlays `process.env`.
- `checkRunner` had disabled dotenv for that `CliEnv`, so YAML secrets never saw disk-backed vars.
- `bin/finalrun.ts` already used a separate `CliEnv` for provider API keys; it did not share the same `cwd` anchor as `runCheck` initially. We align both on **`workspace.rootDir`** so there is **one** dotenv location: next to `.finalrun`, not inside it and not tied to shell `cwd`.

## Goals / Non-Goals

**Goals:**

- One directory for FinalRun-related dotenv: **workspace root** (`FinalRunWorkspace.rootDir`).
- Resolve YAML `secrets.*` from `.env.<resolvedEnvName>` + `.env` at that root when an env is active.
- Same `rootDir` anchor for provider API key loading on `finalrun test` / `finalrun suite`.
- Nested repo `cwd` still resolves the correct workspace and thus the same root-level `.env.*` files.

**Non-Goals:**

- Multiple dotenv roots (e.g. different paths for secrets vs API keys).
- Storing dotenv inside `.finalrun/` for this feature.
- Changing YAML placeholder syntax.

## Decisions

1. **`cwd: workspace.rootDir` for every `CliEnv.load` that serves FinalRun** (check + test entrypoint).  
2. **`runCheck`:** enable dotenv when an env is resolved; keep `includeDotEnv: false` when `usesEmptyBindings`.  
3. **Precedence:** unchanged `CliEnv` order (named file, then `.env` fill-miss, then `process.env`).

## Risks / Trade-offs

- Users who put `.env` only inside `.finalrun/` need to move files to workspace root — acceptable given explicit “one place” product choice.

## Migration Plan

- Move `.env.*` from `.finalrun/` to workspace root if applicable.

## Open Questions

- None.
