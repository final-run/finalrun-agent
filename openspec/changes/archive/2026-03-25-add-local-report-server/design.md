## Context

Today FinalRun writes report data and pre-rendered HTML into `.finalrun/artifacts`:

- `run.json`
- `summary.json`
- `runs.json`
- root `index.html`
- per-run `index.html`

The existing `report serve` command only serves those generated files statically. That keeps the server simple, but it means every report UX change must be encoded into artifact generation first. As the report gets more interactive, especially for suites and nested navigation, the current “generate HTML at run time” model becomes harder to evolve.

The user is proposing a different shape:

- the CLI remains the execution surface
- report data remains local to the repo
- a workspace-scoped local webserver becomes the interactive browsing surface
- the server renders routes dynamically from JSON artifacts instead of serving prebuilt report pages
- the UI layer can use Next.js

This is a larger architectural change than a template tweak. It touches CLI surface area, package boundaries, artifact generation, and local process management.

## Goals / Non-Goals

**Goals:**

- Add a workspace-scoped local report server that runs only from a repo containing `.finalrun`
- Add `finalrun start-server` as the primary entrypoint for browsing local results
- Reuse an already-running server for the same workspace instead of spawning duplicates
- Keep JSON report artifacts as the canonical stored data model
- Render runs, run detail pages, and future suite pages dynamically from the local server
- Make future UI work easier by removing dependence on pre-generated HTML pages
- Print the local URL and open the browser automatically from `start-server`
- Print and open the exact run route when a test completes and the server is already active
- Make this the rendering foundation for future suite and multi-suite UI work

**Non-Goals:**

- Cloud-hosted reporting
- Multi-user or remote access beyond local machine browsing
- Replacing the CLI test execution flow
- Solving suite UX fully in this change; this change creates the platform for it
- Auto-syncing reports across repositories

## Decisions

### 1. Keep JSON artifacts, remove generated report HTML

The report server should treat JSON artifacts as the source of truth:

- `run.json`
- `summary.json`
- `runs.json`

The new local report app should render workspace and run pages dynamically from those files.
Static report HTML generation should be removed in this change rather than kept as a fallback.

Why:

- preserves current artifact contracts
- minimizes migration risk for CLI and tests
- makes UI iteration much cheaper because page structure is no longer baked into run-time HTML generation

Alternative considered:

- keep static `index.html` generation alongside the new server

Rejected because the user wants the webserver flow to be the primary path now, and maintaining both rendering systems would slow iteration immediately.

### 2. Build the report app as a Next.js workspace package

Create a dedicated package, for example `packages/report-web`, responsible for:

- Next.js app routing
- server-side rendering against local JSON artifacts
- browser pages for workspace home and run detail
- a small startup wrapper that the CLI can launch for the current workspace

Why:

- keeps the CLI package focused on command parsing and execution
- isolates report concerns from runner concerns
- makes it easier to evolve the report UI independently
- Next.js gives file-based routing, layouts, and server rendering without inventing a mini web framework inside the repo

Alternative considered:

- build a custom lightweight server-rendered app without a framework

Rejected because the UI is expected to grow and Next.js reduces custom routing/rendering work up front.

### 3. `finalrun start-server` manages one server per workspace

`finalrun start-server` should:

1. resolve the nearest `.finalrun` workspace
2. look for persisted server state for that workspace
3. if the recorded server is healthy, return that URL
4. otherwise start a new local server process and persist its state
5. print the resolved URL
6. open the browser to that URL

Chosen server state file:

```text
.finalrun/artifacts/.server.json
```

Suggested contents:

```json
{
  "pid": 12345,
  "port": 4173,
  "url": "http://127.0.0.1:4173",
  "workspaceRoot": "/repo",
  "startedAt": "2026-03-25T01:00:00.000Z"
}
```

Why:

- the state stays in generated workspace-local data
- restart logic can detect stale PIDs or dead ports
- the CLI can reuse a living server after future test runs

Alternative considered:

- always run the server in the foreground

Rejected because the user specifically wants “start once, reuse later”.

### 4. Use browser routes, not a documented public API, in v1

Recommended first routes:

- `/` -> workspace home / test runs list
- `/runs/:runId` -> individual run report
- `/health` -> health check for reuse detection

The Next.js app can read local JSON artifacts on the server side. If internal route handlers are needed, they are implementation details rather than a documented tooling API in v1.

Why:

- the current root page and run page already map naturally to these routes
- this keeps the product concept simple: “open pages in the browser”
- it avoids committing to an external API contract before it is needed

### 5. Keep `report serve` as a compatibility alias to `start-server`

Recommended migration:

- `finalrun start-server` becomes the user-facing command
- existing `finalrun report serve` delegates to the same underlying server-start flow during a transition period

Why:

- avoids a hard break for current users
- lets documentation move to the simpler command immediately

### 6. Test completion should integrate with the running server, but not require it

When a test run completes:

- if a workspace report server is active, the CLI should print the dynamic run URL and open that exact route in the browser
- if no server is active, the CLI should still succeed normally and can suggest `finalrun start-server`

Why:

- preserves CLI-first workflows
- gives a smooth handoff to the browser when the server is already running
- avoids making test execution depend on server lifecycle

### 7. Support a simple dev-mode startup path for the Next.js app

The Next.js report app should support:

- packaged production startup for normal CLI usage
- a simpler dev-mode startup path for local UI iteration while building the report experience

Why:

- the user explicitly wants simple local iteration for now
- it reduces friction while building the new report UI
- it keeps the app package practical for both product use and development

This does not change the user-facing `finalrun start-server` behavior in production. It only means the package design should not block a straightforward dev workflow.

### 8. This change becomes the base for future suite UI work

The local report server should become the rendering base for suite and multi-suite UX, including the work currently explored in `add-multi-suite-runs`.

Why:

- avoids investing further in static HTML templates that are about to be replaced
- keeps future suite UI work focused on one rendering system
- reduces duplicated implementation between “server migration” and “suite report redesign”

## Risks / Trade-offs

- **[Background process management adds complexity]** → Mitigation: use a simple workspace-local state file plus `/health` probing and stale-state recovery
- **[Local server removes artifact self-containment]** → Mitigation: keep JSON artifacts complete enough that a server can always reconstruct the UI later
- **[Users may expect server auto-start after every test run]** → Mitigation: keep server optional and explicit in v1, but integrate with it when already running
- **[A new package introduces build/test overhead]** → Mitigation: keep the package narrowly scoped to server + rendering only
- **[Next.js adds build/runtime overhead]** → Mitigation: keep the app local-only, route data directly from JSON artifacts, and avoid adding extra backend layers

## Migration Plan

1. add the new Next.js report package and dynamic routes
2. add `finalrun start-server`
3. make current `report serve` delegate to the same start flow
4. keep JSON artifact generation intact
5. remove generated report HTML from the artifact writer and index builder
6. point future suite UI changes at the new report app instead of the old static templates

## Open Questions

- Should `finalrun start-server` reuse a fixed default port first and fall back only when busy, or always choose the first available port dynamically?
