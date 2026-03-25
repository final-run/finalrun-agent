## 1. Report Server Foundation

- [x] 1.1 Create a dedicated Next.js workspace package for the local report app and server startup wrapper.
- [x] 1.2 Add server lifecycle management, including persistence in `.finalrun/artifacts/.server.json`, health checks, and stale-server recovery.
- [x] 1.3 Add `finalrun start-server` in the CLI and wire it to resolve the nearest `.finalrun` workspace before starting or reusing the server, printing the URL and opening the browser.
- [x] 1.4 Add a simple dev-mode startup path for local UI iteration alongside the packaged app flow.

## 2. Dynamic Report Rendering

- [x] 2.1 Define the Next.js routes and server-side JSON-loading layer for workspace home and individual run views.
- [x] 2.2 Refactor current report rendering so the local app reads persisted JSON artifacts and remove generated report `index.html` files from the artifact pipeline.
- [x] 2.3 Integrate completed test runs with the active server so the CLI can print and open the dynamic run URL when available.

## 3. Migration, Tests, And Docs

- [x] 3.1 Make `report serve` delegate to `start-server` as a compatibility alias during migration.
- [x] 3.2 Add coverage for workspace scoping, server reuse, browser-open behavior, route rendering, and active-server run URL output.
- [x] 3.3 Update README and CLI help text for the new local-server workflow, including that browsing results now happens through the local webserver instead of generated HTML files.
