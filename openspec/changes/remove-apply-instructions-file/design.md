## Context

The `frtestspec apply` command currently assembles instructions for an AI agent (system prompt, user prompt context, next steps) and **writes them to a file** (`apply-instructions.md`). The AI agent then reads this file. But the agent already sees stdout — the file is an unnecessary intermediary. The `plan` command does a similar thing with `plan-instructions.md`, but that is out of scope for now.

## Goals / Non-Goals

**Goals:**
- Remove the `apply-instructions.md` file write from `runApplyCommand()`.
- Print the instructions content directly to the console so the AI agent gets them from stdout.
- Return the instructions content in the `runApplyCommand()` result object for programmatic access.

**Non-Goals:**
- Changing `plan-instructions.md` (separate concern, can be addressed later).
- Changing the actual instructions content or prompt quality.
- Altering the approval check or validation flow.

## Decisions

1. **Print to stdout instead of writing a file.**
   - The AI agent already captures stdout output.
   - Eliminates filesystem side-effects and cleanup concerns.
   - Alternative considered: return only in the result object (no print). Rejected because the skill workflow depends on the agent seeing the instructions.

2. **Return instructions in the result object.**
   - `runApplyCommand()` currently returns `{ files: string[] }`. Add an `instructions: string` field.
   - Allows programmatic callers (tests, other commands) to access instructions without reading from disk.

3. **Update the apply skill template wording.**
   - Change step 4 from "Follow the generated instructions" (implying a file) to "Follow the instructions printed above" (implying stdout).

## Risks / Trade-offs

- **[Low] Existing `apply-instructions.md` files left behind**: Users who previously ran `apply` will have stale files on disk. → No mitigation needed; the files are ignored and harmless.
- **[Low] Long stdout output**: The instructions content can be verbose. → Acceptable trade-off; the AI agent benefits from seeing it directly.
