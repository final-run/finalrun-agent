---
name: finalrun-test-and-fix
description: Orchestrate the full FinalRun loop — use finalrun-generate-test to explore a feature and author tests, run them via finalrun-use-cli, then triage failures from CLI artifacts and fix app code or tests until the run is green. Trigger for requests like "debug this failing FinalRun test", "verify and fix the feature with FinalRun", or as the Definition-of-Done loop after a UI change.
---

# FinalRun Test and Fix Orchestrator

You own the end-to-end **generate → run → diagnose → fix** loop for FinalRun coverage in this repository. You do **not** replace `finalrun-generate-test` or `finalrun-use-cli` — you call into them. Your job is to keep the loop moving: plan tests for the feature, execute them, read the artifacts on failure, decide whether the bug is in the **app code** or the **test**, apply the narrowest fix, and re-run until green or until you hit a legitimate blocker.

If your session has an agreed plan, acceptance criteria, and touched files, treat those as the primary inputs — do not start from a blank slate.

## Core Principles

- **Suspected bugs found while exploring are hypotheses, not fix targets.** While `finalrun-generate-test` reads source code to plan tests, you may notice code that looks broken or inconsistent with the acceptance criteria. **Do not fix it yet.** Note it as a hypothesis, make sure the generated test would actually exercise that path, and let the FinalRun run confirm or refute it. Fixing source code before the test runs hides which behaviors the test actually catches and risks "fixing" code that was fine.
- **Generate and run before fixing.** The order is strict: first author or update tests via `finalrun-generate-test`, then get `finalrun check` clean, then execute via `finalrun-use-cli`, and only after that read artifacts and apply fixes. Do not edit app code before the test has run, even if the hypothesis from exploration feels obvious.
- **Fix the app first, the test second.** Once the run has failed and you have read the artifacts, the default hypothesis is that the app does not meet the acceptance criteria. Only edit the test when requirements actually changed, or when the assertion was wrong (for example, asserting on ephemeral toasts/snackbars, or over-tight positional context that the feature does not guarantee). Never relax an assertion just to force green.
- **Artifacts are the source of truth.** Diagnose from the CLI's printed `result.json`, `actions/`, `screenshots/`, `recording.*`, `device.log`, and `runner.log`. Do not guess from the YAML alone, and do not summarize a failure without having read the artifacts the CLI pointed you at.
- **Never fabricate secrets, credentials, or env values.** If a run blocks on a missing shell variable or missing `.finalrun/env/<env>.yaml` binding, hand off to the user with the exact variable name and command. Do not invent values.
- **Keep looping until green or legitimately blocked.** Validation errors, failed steps, and red runs are not the end of the task — they are the loop's input. Stop only when the run is green, or when execution is genuinely impossible: no emulator/device available, required secret missing, or the user opted out.

## Workflow

### 1. Explore and generate

Invoke **`finalrun-generate-test`**. Feed it the current session's plan, acceptance criteria, touched files, and described user flows so its Steps 1–4 build on existing context. Let that skill own the YAML authoring rules, folder grouping, env file handling, and `finalrun check` loop.

**While exploring, do not edit application source code.** If the deep-dive surfaces code that looks suspicious or inconsistent with the acceptance criteria, record it as a *hypothesis* (a one-line note: file, line, what you suspect, which test step would exercise it). Make sure the generated test actually covers that path so the run can confirm or refute the hypothesis. Resist the urge to "just fix it now" — fixes belong in step 5, after the run has produced evidence.

Return here only after `finalrun check` is clean on the scope you changed.

### 2. Run

Invoke **`finalrun-use-cli`** to execute the affected scope. Follow that skill's command construction — it owns the flag semantics. In short:

- **Ask the user whether to rebuild the app or run against an existing build before executing.** Do not rebuild silently and do not assume a prior `--app` artifact is current. If the user chooses rebuild, build first and then pass `--app <fresh artifact>` (Android `.apk`, iOS `.app`). If they choose the existing build, ask for or confirm the path to that artifact and pass it as `--app`.
- **Default to `finalrun test <selectors>` against the single spec(s) you just touched** so iteration is fast and the first failure surfaces immediately. Do **not** run `finalrun suite` unless the user explicitly asks for a suite-level run (for example, to confirm no regressions across the whole feature before sign-off).
- Pass `--env <name>` when the workspace has multiple `.finalrun/env/*.yaml` files.
- Pass `--platform` when it cannot be inferred from the `--app` extension.

If the CLI says the run succeeded, stop — include the report URL and do not escalate.

### 3. Triage on failure

If the run is red, read the artifacts the CLI listed. The layout and reading order are defined in `finalrun-use-cli` under **Post-Execution → On failure** — use that list verbatim rather than duplicating it here. Before writing anything to the user, you should have read at minimum `result.json` for the failing test and the `actions/` entry for the step that failed, plus the screenshot at that step.

### 4. Classify the failure

Map the failure to one of these buckets. This decides who gets edited — app or test.

| Symptom in artifacts | Root cause | Fix target |
|---|---|---|
| The `actions/` entry shows the agent could not ground a described element, but the screenshot clearly shows the correct UI | Test wording too strict (over-tight positional context, wrong label) | **Test** — loosen the step, drop unnecessary positional qualifiers |
| The screenshot shows the app in the wrong state vs. acceptance criteria (missing field, wrong navigation, stale data) | App bug | **App code** |
| `runner.log` or validation output cites an unresolved `${variables.*}` / `${secrets.*}`, or a missing provider API key | Env/binding/secret not available | **Neither — hand off.** Tell the user the exact variable to export; never invent |
| Test flaps on a toast/snackbar that the recording shows briefly appearing and disappearing | Test asserted on ephemeral UI | **Test** — replace the assertion with a check on the persistent consequence (updated list, badge count, changed field, navigated screen) |
| `device.log` shows a crash or the recording ends at a crash dialog | App crash | **App code** |
| `result.json` failure message reports an `expected_state` mismatch and the screenshot confirms the app really is in that state | Requirements changed or assertion was wrong | **Test** — only if the new behavior is correct per the session's acceptance criteria; otherwise **App code** |

When the table does not fit cleanly, default to **app code**.

### 5. Apply the fix

- **App-code fixes:** edit directly in this repo. Keep the fix narrow — do not refactor surrounding code, do not add defensive branches for scenarios that cannot happen.
- **Test YAML fixes:** if the change is a small wording tweak in an existing step or `expected_state` entry, edit the YAML in place. If the change is non-trivial (new setup steps, new edge-case coverage, env binding changes, new feature folder), route back to **`finalrun-generate-test`** so its rules (idempotent setup, allowed action vocabulary, positional-context guidance, env file shape) are applied consistently.
- **Never** silently delete an assertion, weaken `expected_state` to `- The screen is visible`, or comment out a failing test to make the run green.

### 6. Re-run

Re-run **`finalrun check`** on the changed scope. If app code changed, ask the user whether to rebuild before re-running — do not rebuild silently. When they confirm a rebuild, pass the new `--app` artifact; otherwise reuse the existing build path. Then re-run the same `finalrun test` command that failed (stay on the single-spec, fail-fast path; do not escalate to `finalrun suite` unless the user asks). Loop back to step 3 until green.

### 7. Stop conditions

Stop the loop when:

- The run is green. Report success with the CLI's report URL.
- Execution is genuinely blocked: no device/simulator available on this host, a required secret that only the user can provide, or the user explicitly opted out. In that case, print the exact command for the user to run locally — including `--app <path>`, `--env <name>`, and `--platform` when relevant — and state precisely what is blocking.

Do not stop just because a step failed, a validation error appeared, or the first fix did not work. Those are loop inputs, not terminal states.

## What this skill does NOT do

- Authoring YAML from scratch, deciding folder structure, or editing `.finalrun/env/*.yaml` binding shape → route to **`finalrun-generate-test`**.
- Teaching CLI flags, artifact layout, host readiness, provider/model selection, or `finalrun doctor` / `finalrun runs` / `finalrun start-server` usage → route to **`finalrun-use-cli`**.
- Inventing credentials, silently relaxing assertions, or marking a task done without a green run (unless genuinely blocked).

## Coordination with sibling skills

This skill is the orchestrator. It hands work off on each pass of the loop:

- Any request that is purely about **writing or updating** YAML tests, suites, or env bindings → `finalrun-generate-test`.
- Any request that is purely about **running, validating, or reading artifacts** from the CLI → `finalrun-use-cli`.
- Requests to **debug a failing FinalRun run, verify a feature end-to-end, or close out a UI change with FinalRun coverage** → this skill, which will call the other two in order.
