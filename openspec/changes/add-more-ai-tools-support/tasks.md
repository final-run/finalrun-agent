# Tasks: AI Tools Support Expansion

## 1. Data Model Updates

- [ ] 1.1 Update `SupportedTool` enum in `src/lib/project-config.ts` to include `claudecode`, `cursor`, and `copilot`.
- [ ] 1.2 Update `TOOL_SKILLS_DIRS` in `src/lib/workspace.ts` with directory mappings for the new tools.

## 2. CLI Command Updates

- [ ] 2.1 Update `registerInitCommand` in `src/commands/init.ts` to include new tools in the `--tool` option description.
- [ ] 2.2 Update interactive prompt choices in `resolveTools` in `src/commands/init.ts`.

## 3. Verification

- [ ] 3.1 Update `test/workflow.test.mjs` to add tests for Claude Code, Cursor, and Copilot skill initialization.
- [ ] 3.2 Run `npm test` to verify all supported tools correctly initialize.
- [ ] 3.3 Manually verify `frtestspec init --tool cursor` in a temporary directory.
