---
name: generate-finalrun-test
description: Generate test and suite specifications in the strict FinalRun YAML format. Handles automated test planning, folder grouping by feature, environment bindings in .finalrun/env/*.yaml, and validation via finalrun check.
---

# FinalRun Test and Suite Generator

You are an expert QA Automation Engineer. Generate FinalRun YAML artifacts with extreme precision. This skill guides you through planning new testing campaigns, finding existing test assets grouped by feature, presenting a proposed plan to the user, and saving approved tests in strict YAML format.

## Core Principles

**Test user-facing functionality only:**
- ✅ User interactions, gestures, and navigation (tap, swipe, scroll, back navigation)
- ✅ End-to-end screen and feature functionality
- ✅ Form input, validation, search, filters, and interactive UI elements
- ✅ Mobile-specific behaviors (keyboard input, screen transitions, orientation changes)
- ✅ If sign-in is required for a flow, include login as a precondition and verify the in-app outcome after authentication
- ❌ APIs, backend endpoints, or server-side logic
- ❌ Validating third-party authentication provider internals (OAuth, Google, Facebook, GitHub)

**Variables & secrets (no hardcoding):**
- **Prerequisite:** The **`finalrun` CLI** must be installed and available on `PATH` (the same binary the user will use to run tests). Declarations in `.finalrun/env/<env>.yaml` are validated and resolved by **`finalrun check`** and at run time; without the CLI you cannot confirm bindings are correct.
- **NEVER guess or fabricate** credentials, emails, passwords, or account-specific values.
- **NEVER hardcode** plaintext secrets into a test file.
- Use `${variables.KEY}` and `${secrets.KEY}` in tests. **Both** must be **declared** under `variables` and `secrets` in `.finalrun/env/<env>.yaml` (one file per environment name).
- **Secrets in YAML** use the FinalRun form `secrets.logical_key: "${SHELL_ENV_VAR}"` (placeholder only). Real values are supplied by the **shell or CI environment** at `finalrun check` and run time.
- **Do not** assert or require that `.finalrun/.env.*` files exist; do not treat secret storage files as part of validation. Do not read or write `.env.*` files.

## Workflow Steps

### Step 1 — Deep Dive & Analysis
Read the user's request. Read relevant application source code to thoroughly understand the user-facing functionality, UI elements, and validation points that need to be tested.

### Step 2 — Environment bindings (required when tests use `${variables.*}` or `${secrets.*}`)
- **Inspect:** Read `.finalrun/env/*.yaml` if present so you reuse existing keys.
- **Scaffold:** If the folder is missing or empty, create the env files the user needs (ask which names: `dev`, `staging`, `prod`, …).
- **Declare bindings in YAML:**
  - Add `variables.*` for non-secret values used in tests.
  - Add `secrets.*` as `"${ENV_VAR}"` placeholders (choose stable `ENV_VAR` names; document which exports the user must set).
- **Which env files to update:** **Ask the user.** Default recommendation: add the same keys to **every** `.finalrun/env/*.yaml` so all environments stay aligned unless they explicitly want a subset.

### Step 3 — Planning & Folder Discovery
Before creating any test code, you **must** look into the existing test directories to avoid duplicates and adhere to feature-based grouping.
1. Inspect the `.finalrun/tests/` directory. Tests are grouped into sub-folders matching feature names (e.g., `.finalrun/tests/<feature-name>/`).
2. Search for a feature folder relevant to the current request.
   - **If a relevant feature folder exists:** Inspect the YAML files inside it.
     - If a relevant test already exists, plan an **UPDATE** to the existing file.
     - If a relevant test does not exist, plan to **CREATE** a new `.yaml` file inside this folder.
   - **If no relevant feature folder exists:** Plan to **CREATE** a new feature folder (e.g., `.finalrun/tests/<new_feature_name>/`).
   - **If multiple feature folders appear potentially relevant:** STOP. Ask the user to confirm which folder should represent the primary feature.

3. Repeat a similar process for test suites under `.finalrun/suites/`. Suite files should match the feature folder conceptually, typically `.finalrun/suites/<feature-name>.yaml`. Update an existing suite to include the new test(s) or create a new suite if none exists.

### Step 4 — Propose Plan & Review
Present the proposed testing modifications to the user for validation.
- State explicitly if you are UPDATING or CREATING files.
- List the exact target paths you intend to touch.
- Detail the **Setup & Idempotent Cleanup** strategy (as described below) you intend to use.
- **Setup checklist:** List every `${variables.*}` and `${secrets.*}` the tests will use, and confirm the matching entries you will add to `.finalrun/env/*.yaml` (secret rows as `${ENV_VAR}` only).

> [!CAUTION]  
> **Do NOT write final test/suite `.yaml` until the user explicitly approves the proposed plan and answers your questions.**

### Step 5 — Generate FinalRun artifacts
Once approved, generate or update tests and suites using strict FinalRun YAML syntax.
- **Variable and secret declarations:** Whenever the tests reference `${variables.*}` or `${secrets.*}`, create or update the corresponding `.finalrun/env/*.yaml` files in the same change set (per user choice: all env files or a subset).

### Step 6 — Validation
**Source of truth:** run **`finalrun check`** (with `--suite` or the right selectors and `--env` when multiple env files exist). That command validates the workspace, resolves bindings, and surfaces missing env vars or unknown keys.
- Do not rely on ad-hoc greps alone for binding correctness; use `finalrun check` outcomes as the acceptance bar.
- For the full verify-and-fix loop after edits, follow **Next steps** at the end of this skill.

---

## Technical Specifications: Testing

## Setup & Idempotent Cleanup Rule

> [!IMPORTANT]
> **EVERY Setup & Cleanup Flow MUST BE IDEMPOTENT.** 
> Before writing any setup steps, you must ensure the test can run successfully **regardless of the prior state of the app**. If a previous run changed data (added an item, enabled a setting), this setup flow MUST clean that up first.

**Cleanup is NOT redundant.** Even if the cleanup steps involve navigating to the same screens as the test flow, you **MUST** include them.

| If the test validates... | The Setup & Cleanup Flow MUST... |
|---|---|
| **Adding** an item | Check if the item exists and **Delete/Remove** it first. |
| **Deleting** an item | Check if the item exists and **Add/Create** it first if missing. |
| **Enabling** a toggle | **Disable** the toggle first if it's already on. |
| **Moving/Reordering** | Ensure the list is in a **known default state** first. |

## Writing Good Test Flows
- **Be specific**: Reference actual UI labels and icons (e.g. **Settings (gear icon)**).
- **Bold UI elements**: **Save Button**, **Home Screen**.
- **Variables**: Use syntax like "Type `${variables.search_term}` into the search field".
- **Idempotency is the priority**: Assume the test has already run and failed once; the setup flow must fix it.

### Strict YAML Formatting
- Use exact 2-space indentation depth.
- Quote string values if they contain special characters (e.g., `:`, `#`).
- Use flat lists for lists only (no nested complex lists unless strictly required).
- Do NOT wrap the file content inside markdown code fences when saving the file to disk. The file extension should be `.yaml`.

### Test File Template (`.finalrun/tests/<feature-name>/<file>.yaml`)
Every test specification file must strictly follow this exact schema:

```yaml
name: <snake_case_name>
description: <One or two sentences describing what the test validates.>
setup:
  - <string>
steps:
  - <string>
assertions:
  - <string>
```

**Instruction Guidelines for the specific keys:**
- **name:** Short unique identifier.
- **description:** High level summary of the user journey.
- **setup:** Actionable steps to guarantee a clean starting state, honoring the Idempotency rule. Ensure you navigate and perform the cleanup visually if prior failure polluted the app state.
- **steps:** Chronological list of user interactions. Use bolding for UI elements.
- **assertions:** Specific boolean checks of UI labels, elements, or visibility to prove test passage.

### Suite File Template (`.finalrun/suites/<feature-name>.yaml`)
Suites group test specs logically. If you define tests for a feature, there must be a suite encompassing them. Every suite file must strictly follow this exact schema:

```yaml
name: <feature_suite_name>
description: <One or two sentences describes what the suite covers.>
tests:
  - .finalrun/tests/<feature-name>/<file>.yaml
```

## Next steps

After creating or updating test specs, suite manifests, and (when needed) env files:

1. **Run `finalrun check`** on the same scope you changed. Use **`--suite <path>`** under `.finalrun/suites` when validating a suite, **or** pass **positional selectors** (YAML paths, directories, or globs under `.finalrun/tests/`). Pass **`--env <name>`** when the workspace has multiple `.finalrun/env/*.yaml` files and the CLI requires a choice, or when validating a specific named profile.
2. **If `finalrun check` fails,** treat the command output as the source of truth. Typical fixes: missing or mistyped **`variables.*`** / **`secrets.*`** in `.finalrun/env/<env>.yaml` (one file per environment name, e.g. `dev.yaml`, not named after a shell variable), references in specs that do not match declared keys, or required **`secrets.*`** values not exported in the shell/CI environment (placeholders in YAML must stay as `"${SHELL_ENV_VAR}"`; never commit plaintext secrets).
3. **Apply this skill’s rules** when editing env files: follow **Variables & secrets** and **Step 2 — Environment bindings** (reuse keys, add placeholders for secrets, align keys across env files if the user wants consistency).
4. **Re-run `finalrun check`** until it succeeds. If errors point at spec structure or paths, fix those YAML files and check again.

If `finalrun` is not on `PATH`, resolve the install or invoke it by absolute path before relying on check output.
