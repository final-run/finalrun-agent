# Changesets

This directory holds [Changesets](https://github.com/changesets/changesets) used
to coordinate versioning and publishing of the public packages in this monorepo:

- `@finalrun/common`
- `@finalrun/report-web`
- `@finalrun/finalrun-agent`

`@finalrun/goal-executor` and `@finalrun/device-node` are intentionally ignored
(they ship only as `bundleDependencies` inside `@finalrun/finalrun-agent`).

## Workflow

1. After making a change in a public package, run:
   ```
   npx changeset
   ```
   Pick the packages and the bump type (patch/minor/major) and write a short
   summary. A markdown file appears in this directory.

2. Commit the changeset file alongside the code change in the same PR.

3. On `main`, to cut a release:
   ```
   npx changeset version   # bumps package.json versions, updates deps, writes CHANGELOG
   git commit -am "chore: release"
   npx changeset publish   # publishes bumped packages to npm
   ```
