## Component: CLI Commands

### [MODIFY] [init.ts](file:///Users/tamoyai/Development/finalrun-ts/finalruntestspec/src/commands/init.ts)
- Refactor `runInitCommand` to check if `frtestspec/config.yaml` already exists at the start.
- If it exists, throw an Error: "Project already initialized. Use 'frtestspec update' to modify orientation or refresh skills."
- Remove the "Refreshing" branch from the logic.
- Remove `resolveScope` and `resolveTools` from this file if they are moved to a shared location.

### [MODIFY] [update.ts](file:///Users/tamoyai/Development/finalrun-ts/finalruntestspec/src/commands/update.ts)
- Update `UpdateCommandOptions` to include `tool`, `scope`, and `command` (same as `InitCommandOptions`).
- In `runUpdateCommand`, if any of these options are provided:
    - Load the existing configuration.
    - Resolve the new values (using shared `resolveScope`/`resolveTools` logic).
    - Create a new `ProjectConfig` and call `writeProjectConfig`.
- Always call `writeManagedSkills` at the end (as it currently does).
- Register the new options in `registerUpdateCommand`.

### [NEW] [cli-utils.ts](file:///Users/tamoyai/Development/finalrun-ts/finalruntestspec/src/commands/cli-utils.ts)
- Move `resolveScope`, `resolveTools`, and potentially other shared interactive/resolution logic here to be shared by `init.ts` and `update.ts`.

## Verification Plan

### Automated Tests
- Update `finalruntestspec/test/workflow.test.mjs`:
    - Add a test case: `init fails if config already exists`.
    - Add a test case: `update modifies config if options provided`.
    - Ensure existing `init` and `update` tests still pass (with adjustments if needed).
