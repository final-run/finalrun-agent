## Why

The current report flow pre-renders static HTML pages into `.finalrun/artifacts`, then serves those files over a simple static server. That works for basic runs, but it makes richer navigation harder to evolve because every new report shape has to be encoded into generated HTML at write time.

A local workspace-scoped report server would make the UI easier to grow. The CLI could keep writing JSON artifacts as the source of truth, while the server renders the latest workspace, run, suite, and test views dynamically on demand.

## What Changes

- Add a local report server mode that runs from a repository containing `.finalrun`.
- Add a new CLI entrypoint, `finalrun start-server`, that starts or reconnects to the report server for the current workspace.
- If the workspace report server is already running, `finalrun start-server` should return the existing URL instead of starting a second server.
- `finalrun start-server` should both print the URL and open the browser.
- Move report rendering from pre-generated `index.html` files to a local Next.js web app backed by JSON artifacts.
- Keep JSON artifacts such as `run.json`, `summary.json`, and `runs.json` as the persisted report data model.
- Persist workspace server state in `.finalrun/artifacts/.server.json`.
- Stop generating static report HTML files once the local server flow is introduced.
- Add workspace routes such as:
  - workspace home / test runs list
  - individual run report
  - future suite-oriented pages
- Introduce a dedicated package for the local Next.js report app so UI concerns are separated from the CLI runner package.
- Preserve current CLI-first workflow: run tests in the terminal, then open or redirect to the local server for browsing results.
- When a test finishes and the workspace server is already running, print the exact run URL and open that run page automatically.
- Keep `finalrun report serve` as a compatibility alias to the new server-start flow for a transition period.
- Support a simple dev-mode startup path for local UI iteration in addition to the packaged app flow.

## Capabilities

### New Capabilities
- `local-report-server`: Start and reuse a workspace-scoped local Next.js web server that renders FinalRun report data from JSON artifacts.

### Modified Capabilities
- None.

## Impact

- `packages/cli`: new `start-server` command, server lifecycle integration, browser-open behavior, and exact run URL output
- new Next.js workspace package for report serving and rendering
- existing report artifact generation, especially removal of static HTML generation and retention of JSON manifests
- README and user workflow docs for browsing local results
- tests for server startup, reuse, route rendering, and workspace scoping
