## 1. Workspace Resolution

- [x] 1.1 Add a workspace-hash helper that derives a stable hash from the canonical workspace root and resolves artifact paths under `~/.finalrun/workspaces/<workspace-hash>/artifacts`
- [x] 1.2 Update workspace resolution so FinalRun always uses the hashed external artifacts directory instead of repo-local `.finalrun/artifacts`
- [x] 1.3 Write hashed workspace metadata and ensure the resolved artifacts directory exists during workspace initialization

## 2. Artifact Consumers

- [x] 2.1 Update CLI, run-index, test-runner, and report-server flows to rely on the resolved `workspace.artifactsDir` without changing the native driver asset cache
- [x] 2.2 Update user-facing help text and README guidance to describe hashed external storage and the separation from `~/.finalrun/assets/<version>`

## 3. Verification

- [x] 3.1 Add workspace tests for hashed external path resolution, nested cwd stability, and metadata output
- [x] 3.2 Add report and run-index tests to verify `runs.json` and `.server.json` are created and reused under the hashed external artifacts directory
- [x] 3.3 Add compatibility documentation for existing repo-local artifact directories after the artifact location changes
