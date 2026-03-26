## 1. Shared Logic Extraction

- [x] 1.1 Create `finalruntestspec/src/commands/cli-utils.ts`
- [x] 1.2 Move `resolveScope` and `resolveTools` from `init.ts` to `cli-utils.ts`.
- [x] 1.3 Export `InitCommandOptions` (or a base version of it) if needed for reuse.

## 2. Refactor Update Command

- [x] 2.1 Update `finalruntestspec/src/commands/update.ts` to accept `tool`, `scope`, and `command` options.
- [x] 2.2 Implement logic in `runUpdateCommand` to update `config.yaml` if options are provided.
- [x] 2.3 Ensure `writeProjectConfig` is called when configuration changes.
- [x] 2.4 Update `registerUpdateCommand` to include the new options.

## 3. Refactor Init Command

- [x] 3.1 Update `runInitCommand` in `finalruntestspec/src/commands/init.ts` to check for existing config.
- [x] 3.2 Add early exit/error if config exists.
- [x] 3.3 Clean up redundant "refresh" logic and prompts.

## 4. Verification

- [x] 4.1 Update `finalruntestspec/test/workflow.test.mjs` with new test cases.
- [x] 4.2 Run tests using `npm run test` in `finalruntestspec` directory.
