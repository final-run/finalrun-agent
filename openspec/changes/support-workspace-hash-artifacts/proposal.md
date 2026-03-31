## Why

FinalRun currently stores run artifacts under the tested repository's `.finalrun/artifacts` directory. That keeps reports repo-local, but it also mixes generated run output with authored workspace files and does not support moving artifacts into a user-level cache without losing per-workspace isolation.

## What Changes

- Resolve run artifacts outside the user repository by default using a stable workspace hash derived from the resolved workspace root.
- Build per-workspace external artifact storage under the user-level FinalRun root instead of storing run output inside the tested repository.
- Keep native driver assets in the existing versioned asset cache and do not merge run artifacts into that tree.
- Publish per-workspace metadata alongside the hashed artifact directory for debugging and future tooling.
- Document the new artifact location and the compatibility story for existing repo-local artifact directories.

## Capabilities

### New Capabilities
- `external-artifact-storage`: Resolve run artifacts into a stable per-workspace external directory using a workspace hash under the user-level FinalRun root.

### Modified Capabilities
None.

## Impact

- Workspace resolution in `packages/cli/src/workspace.ts`
- Runtime cache and path helpers in `packages/cli/src/runtimePaths.ts` and related utilities
- Report server startup and persisted server state in `packages/cli/src/reportServerManager.ts`
- Run index and run writer paths in `packages/cli/src/runIndex.ts` and `packages/cli/src/testRunner.ts`
- CLI documentation and tests covering `.finalrun/artifacts` assumptions
