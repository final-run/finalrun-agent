---
'@finalrun/common': minor
'@finalrun/report-web': minor
---

Publish `@finalrun/common` and `@finalrun/report-web` to npm for the first
time. Previously common shipped only as a `bundleDependency` of
`@finalrun/finalrun-agent`, and report-web was unpublished (consumed only
via yalc / local tarballs).

`@finalrun/report-web` is also fully migrated from a Next.js App Router
shell to a Vite SPA; the library exports (`/ui`, `/ui/styles.css`,
`/routes`) are unchanged.
