# AGENTS.md

## FinalRun Tests After Implementation (CRITICAL)

This repo includes a **FinalRun** workspace under **`.finalrun/`** (YAML tests, suites, env bindings).

**CRITICAL RULE:** When you finish coding a user-facing feature, **DO NOT STOP**. You are **NEVER** permitted to treat the task as "done" until FinalRun coverage is updated and executed for that scope. You MUST AUTOMATICALLY transition to the testing phase without asking for user permission (unless the change is docs-only, backend-only, a refactor with no UX impact, or the user explicitly opts out).

Follow this exact, uninterrupted sequence for every UI task:

1. **Continue automatically in the same thread** — use the **`finalrun-generate-test`** skill immediately. Install FinalRun skills with `npx skills add final-run/finalrun-agent` if needed, or open the skill source from the `finalrun-agent` / `finalrun-ts` repository.

2. **Reuse the session's plan** — use the agreed plan, acceptance criteria, touched files, and described user flows as the **primary** input for test planning (the skill's Steps 1–3). Do not ignore prior planning or start from a blank slate.

3. **Execute the skill to completion** — propose updates if required, then write or update **`.finalrun/tests/`**, **`.finalrun/suites/`**, and **`.finalrun/env/*.yaml`** as needed, and run **`finalrun check`** until clean.

4. **Run tests with fail-fast** — after **`finalrun check`** succeeds, immediately follow the **`finalrun-use-cli`** skill and execute the affected scope on a host where the CLI and a device or simulator are available. **Always exercise the build you just produced:** when implementation changed app code, **build first**.

   **Fail-fast execution (mandatory):** Do **not** run the entire suite in one shot. Instead, read the suite YAML to get the ordered list of tests, then run each test individually with **`finalrun test <selector>`** one at a time. If a test **fails**:
   * **Stop immediately** — do not proceed to the next test.
   * **Diagnose the failure** from the CLI output and run artifacts (`finalrun runs`).
   * **Fix the issue** — whether it is in the application code, the test spec, or the environment config.
   * **Re-run that specific test** until it passes.
   * **Only then continue** to the next test in the suite.

   This ensures failures surface early, LLM credits are not wasted on downstream tests that would also fail, and the agent fixes problems in-line rather than producing a batch of failures to triage later.

   * Pass **`--app <path>`** pointing at that fresh installable — **Android:** **`--app path/to/your.apk`**; **iOS:** **`--app path/to/Your.app`**.
   * FinalRun treats **`.apk`** vs **`.app`** as the platform hint; add **`--platform`** when the CLI still requires it.
   * Use **`--env`** when the workspace has multiple **`.finalrun/env/*.yaml`** files.

Treat the run as an absolute requirement of the implementation thread unless execution is genuinely impossible (for example: no emulator or device, missing required API keys or secrets, or the user opted out). In those blocked cases, state exactly what blocked the run and provide the exact command for the user to run locally (including the **`--app`** flag).

**Claude Code:** lifecycle gating is configured in **`.claude/settings.json`** (Stop / SubagentStop / TaskCompleted prompt hooks). Set `"disableAllHooks": true` in Claude Code settings to turn off all hooks, or edit that file to remove the `hooks` block to disable only these.

**Antigravity:** you can override or extend this section in repo-root **`GEMINI.md`** where that product gives it precedence.
