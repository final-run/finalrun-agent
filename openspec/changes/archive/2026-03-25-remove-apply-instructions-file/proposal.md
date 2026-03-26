## Why

The `frtestspec apply` command currently writes a separate `apply-instructions.md` file to disk, then tells the AI agent to read it. This is unnecessary — the AI agent already sees `stdout`. Writing a file adds filesystem clutter in `frtestspec/changes/<campaign>/` and creates a side-effect that must be tracked, tested, and cleaned up. The instructions should be printed directly to the console instead.

## What Changes

- **Remove `apply-instructions.md` file generation** from `apply.ts`. Instead, print the prompt context and next steps directly to stdout.
- **Update the apply skill template** in `skills.ts` to reflect that instructions are printed, not written to a file.
- **Update the workflow test** to stop asserting that `apply-instructions.md` exists on disk.
- **Return the instructions content** from `runApplyCommand()` so programmatic callers can access it without reading from disk.

## Capabilities

### New Capabilities

_None_

### Modified Capabilities

- `approved-plan-application`: The apply command stops writing a separate instructions file to disk and instead outputs instructions directly to the console.

## Impact

- **`finalruntestspec/src/commands/apply.ts`**: Remove file write, print instructions to stdout, return instructions in the result object.
- **`finalruntestspec/src/lib/skills.ts`**: Update `renderApplySkill()` step 4 wording.
- **`finalruntestspec/test/workflow.test.mjs`**: Remove the `apply-instructions.md` file existence assertion.
- **Breaking**: Any workflow that reads `apply-instructions.md` from disk will break, but no such consumers exist today.
