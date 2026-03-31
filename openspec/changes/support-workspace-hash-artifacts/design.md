## Context

FinalRun currently resolves `workspace.artifactsDir` as `<workspace>/.finalrun/artifacts`, and every report-oriented code path consumes that resolved directory. Native driver assets follow a different lifecycle and are stored under the versioned user cache at `~/.finalrun/assets/<version>`, so moving run artifacts into the same tree would couple user history to CLI version changes and create shared state across repositories.

The desired outcome is to support storing run artifacts outside the tested repository while preserving workspace isolation. A workspace hash gives us a deterministic, collision-resistant folder name that can live under a user-level root such as `~/.finalrun/workspaces/`.

## Goals / Non-Goals

**Goals:**
- Store run artifacts outside the tested repository by default.
- Derive the external artifacts path from a stable workspace hash so multiple repositories do not share `runs.json` or `.server.json`.
- Keep driver asset caching unchanged and separate from run artifact storage.

**Non-Goals:**
- Automatically migrate existing repo-local artifact directories into the external location.
- Change the layout or lifecycle of native driver assets in `~/.finalrun/assets/<version>`.
- Introduce multiple artifact storage modes beyond repo-local default and hashed external storage.

## Decisions

### 1. Resolve artifacts under the user-level FinalRun root

FinalRun will always resolve run artifacts under `~/.finalrun/workspaces/<workspaceHash>/artifacts`. This keeps generated run output outside the tested repository while preserving workspace isolation through the hash-derived directory name.

Rationale:
- This matches the product direction discussed for now: no config gate, just move run output out of the repo.
- A fixed user-level root is enough to support workspace-hash based storage without exposing storage-mode configuration.
- It avoids confusing run artifact storage with the existing versioned driver asset cache.

Alternatives considered:
- Keeping repo-local `.finalrun/artifacts`. Rejected because it preserves the current clutter and does not solve the original motivation for the change.
- Adding `artifactsRoot` and `FINALRUN_ARTIFACTS_ROOT` first. Rejected for now because the extra configuration is not required to ship the workspace-hash layout.

### 2. Derive a stable workspace hash from the canonical workspace root

FinalRun will:
1. Resolve the workspace root to its canonical real path.
2. Normalize platform-specific casing only where the filesystem is case-insensitive.
3. Compute `sha256(canonicalWorkspaceRoot)` and truncate the hex digest to a short stable identifier.
4. Build the artifacts directory as `~/.finalrun/workspaces/<workspaceHash>/artifacts`.

Rationale:
- The canonical root makes the hash stable across nested working directories and symlink entrypoints.
- Truncated SHA-256 is deterministic and sufficiently collision-resistant for workspace folder naming.
- A dedicated `workspaces/<hash>/artifacts` path keeps hashed workspaces separate from `assets/`.

Alternatives considered:
- Hashing the raw CLI cwd. Rejected because the value would change depending on where the command was invoked.
- Using the repository basename. Rejected because names collide easily across different repositories.

### 3. Keep existing artifact consumers unchanged by resolving `workspace.artifactsDir` earlier

The workspace resolver becomes the single place that decides whether artifacts are repo-local or external. Downstream systems such as the test runner, runs index, report server, and report web continue to consume `workspace.artifactsDir` without needing their own branching logic.

Rationale:
- Limits the change to path resolution instead of spreading storage-mode decisions across the codebase.
- Preserves existing contracts for `runs.json`, per-run folders, and `.server.json`.

Alternatives considered:
- Teaching each consumer how to resolve hashed paths independently. Rejected because it duplicates logic and increases drift risk.

### 4. Write hashed workspace metadata for debugging and future cleanup

FinalRun will write a small metadata file such as `~/.finalrun/workspaces/<workspaceHash>/workspace.json` containing the canonical workspace root, the workspace hash, and the resolved artifacts directory.

Rationale:
- Makes the hash-to-workspace mapping inspectable.
- Creates a future hook for cleanup, diagnostics, or migration tooling.

Alternatives considered:
- No metadata file. Rejected because hashed directory names are otherwise opaque during support/debugging.

## Risks / Trade-offs

- [Workspace moved or renamed] -> The canonical path changes, so the workspace hash changes and new runs land in a new external directory. Mitigation: document this behavior and keep migration manual for now.
- [Symlink or case-normalization edge cases] -> Different path representations could hash differently. Mitigation: use canonical real paths and explicit normalization rules.
- [Opaque hashed folders] -> Users cannot identify a workspace from the folder name alone. Mitigation: write `workspace.json` metadata alongside the hashed directory.
- [Behavior change for existing users] -> New runs will no longer appear under repo-local `.finalrun/artifacts`. Mitigation: document the new location and keep old repo-local artifacts readable if users retain them manually.

## Migration Plan

1. Ship the change with hashed external storage as the default.
2. Leave existing repo-local artifacts in place; do not auto-copy or auto-delete them.
3. Update docs so users understand the new location and how to manually move or discard old repo-local artifacts.

## Open Questions

- Do we want a future utility for migrating repo-local artifacts into the hashed external directory, or is documentation enough for the first version?
