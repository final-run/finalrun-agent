---
name: finalrun-generate-test
description: Generate test and suite specifications in the strict FinalRun YAML format. Handles automated test planning, folder grouping by feature, repo app configuration, environment-specific overrides in .finalrun/env/*.yaml, and validation via finalrun check.
---

# FinalRun Test and Suite Generator

You are an expert QA Automation Engineer. Generate FinalRun YAML artifacts with extreme precision. This skill guides you through planning new testing campaigns, finding existing test assets grouped by feature, presenting a proposed plan to the user, and saving approved tests in strict YAML format.

## Core Principles

**Test user-facing functionality only:**
- ✅ User interactions, gestures, and navigation (tap, swipe, scroll, back navigation)
- ✅ End-to-end screen and feature functionality
- ✅ Form input, validation, search, filters, and interactive UI elements
- ✅ Mobile-specific behaviors (keyboard input, screen transitions, orientation changes)
- ❌ APIs, backend endpoints, or server-side logic
- ❌ Validating third-party authentication provider internals (OAuth, Google, Facebook, GitHub)

**Variables & secrets (no hardcoding):**
- **Prerequisite:** The **`finalrun` CLI** must be installed and available on `PATH` (the same binary the user will use to run tests). Declarations in `.finalrun/env/<env>.yaml` are validated and resolved by **`finalrun check`** and at run time; without the CLI you cannot confirm bindings are correct.
- **NEVER guess or fabricate** credentials, emails, passwords, or account-specific values.
- **NEVER hardcode** plaintext secrets into a test file.
- Use `${variables.KEY}` and `${secrets.KEY}` in tests. **Both** must be **declared** under `variables` and `secrets` in `.finalrun/env/<env>.yaml` (one file per environment name).
- **Secrets in YAML** use the FinalRun form `secrets.logical_key: "${SHELL_ENV_VAR}"` (placeholder only). Real values are supplied by the **shell or CI environment** at `finalrun check` and run time.
- **Do not** assert or require that `.finalrun/.env.*` files exist; do not treat secret storage files as part of validation. Do not read or write `.env.*` files.

**App configuration (required):**
- FinalRun runs require `.finalrun/config.yaml` to define the default app identity for the repo.
- Use `app.packageName` for Android and `app.bundleId` for iOS.
- Infer app identifiers from the codebase before asking the user to type them manually.
- Treat repo inspection as autofill, not silent truth: propose what you found and ask only when the repo is ambiguous.
- Ask whether the app identifier changes by environment.
- If the identifier is the same everywhere, keep app identity only in `.finalrun/config.yaml`.
- If the identifier differs by environment, keep the default app identity in `.finalrun/config.yaml` and replace it with a full env-specific `app` block under `.finalrun/env/<env>.yaml`.
## Workflow Steps

### Step 1 — Deep Dive & Analysis
Read the user's request. Read relevant application source code to thoroughly understand the user-facing functionality, UI elements, and validation points that need to be tested.

### Step 1A — Infer app identity (name, bundle ID, package name) from the repo
Inspect the code base files and infer them when possible. take decision on whether the repo of for android, ios or cross-platform. If you find multiple identifiers, propose the best candidate and ask the user to confirm which one is correct. If the repo structure makes it clear that different environments use different app identifiers, propose the inferred values for each env and ask the user to confirm.

- **Inference rules:**
  - If one identifier is clearly the repo default, write it to `.finalrun/config.yaml`.
  - If env-specific identifiers are clearly derivable, keep the default in `.finalrun/config.yaml` and put only the differing value in `.finalrun/env/<env>.yaml`.
  - Reuse existing env names from `.finalrun/env/*.yaml` before inventing new ones.
- **Guardrails:**
  - Do **not** treat Android `namespace` as the app package unless there is no better source.
  - Do **not** infer env names from every flavor automatically; `free` / `paid` are not the same as `dev` / `staging` / `prod`.
  - Do **not** silently overwrite an existing `.finalrun/config.yaml` app block. Show the proposed change first.
  - Ask the user only when multiple app modules/targets are plausible or the identifiers cannot be resolved confidently.

### Step 1B — Edge Case & State Analysis

After understanding the happy-path functionality in Step 1, systematically review the source code for **state-dependent flows** and **empty/error states** that affect the UI the user asked you to test. The goal is to surface testable edge cases and propose them alongside the happy path in Step 4.

**State-dependent flows:**
Identify places where the UI renders differently based on prior state. Read the code for conditional rendering, route guards, and data checks that change what the user sees.

- **Authentication gates** — Does the screen require login? What does the user see if their session has expired or they are logged out? Look for auth checks, redirects to login, or guest-mode fallbacks.
- **First-run vs returning user** — Is there an onboarding flow, tutorial overlay, or welcome screen that only appears once? Look for flags like `hasSeenOnboarding`, `isFirstLaunch`, or similar stored preferences.
- **Permission-dependent UI** — Does the feature degrade or show a fallback when a required permission (camera, location, contacts) is denied? Look for permission check results that branch the UI.
- **Feature flags / A-B tests** — Is the feature behind a flag that could be off? If so, note this as a precondition the user needs to be aware of, not something to test blindly.

**Empty and error states:**
Identify every place the UI handles zero-data or failure conditions. These are high-value test targets because they are frequently overlooked.

- **Empty collections** — What does the screen show when a list, feed, cart, or search result set has zero items? Look for empty-state illustrations, "no results" messages, or call-to-action prompts (e.g., "Add your first item").
- **Search with no matches** — Does the search/filter UI show a distinct empty state vs the default empty list?
- **Form validation errors** — What happens when the user submits invalid input? Look for inline field errors, summary banners, disabled submit buttons, or toast messages. Identify each validation rule the code enforces (required fields, format checks, min/max length, mismatched passwords).
- **Boundary inputs** — Does the code enforce character limits, numeric ranges, or disallowed characters? These are testable: type the maximum-length input and verify truncation or rejection.

**What to do with findings:**
- Do **not** generate edge-case tests automatically. Collect them as candidates.
- In Step 4 (Propose Plan), present the discovered edge cases as an **"Edge cases identified"** section alongside the main test plan. Group them by category (state-dependent, empty state, validation error, etc.).
- Let the user choose which edge cases to include. Some may be out of scope or lower priority.
- For each selected edge case, the resulting test must follow the same **Idempotent Prep Rule** — the first items in `steps` must force the app into the specific state the edge case requires (e.g., clear all items to test the empty state, revoke a permission to test the denied flow).

### Step 2 — Environment profiles (required when tests use `${variables.*}` or `${secrets.*}`, or when app identity differs by environment)
- **Inspect:** Read `.finalrun/config.yaml` and `.finalrun/env/*.yaml` if present so you reuse the existing app config and binding keys.
- **Scaffold:** If the folder is missing or empty, create the env files the user needs (ask which names: `dev`, `staging`, `prod`, …) only when the tests need env-specific bindings or env-specific app overrides.
- **App setup:**
  - Ensure `.finalrun/config.yaml` has the default repo app identity.
  - Prefer repo-derived app identity over manual entry whenever the codebase makes it clear.
  - Ask whether the app identifier changes by environment only if the repo structure does not make that obvious.
  - If yes, add only the env-specific `app` override to `.finalrun/env/<env>.yaml`.
  - If no, keep the app identity only in `.finalrun/config.yaml`.
- **Declare bindings in YAML:**
  - Add `variables.*` for non-secret values used in tests.
  - Add `secrets.*` as `"${ENV_VAR}"` placeholders (choose stable `ENV_VAR` names; document which exports the user must set).
- **Which env files to update:** **Ask the user.** Default recommendation: add the same keys to **every** `.finalrun/env/*.yaml` so all environments stay aligned unless they explicitly want a subset.
- **Allowed env file shapes:** `.finalrun/env/<env>.yaml` may contain `app`, `variables`, `secrets`, or any combination of them.

**Recommended generated config shapes:**

Same package everywhere:

```yaml
app:
  name: ExampleApp
  packageName: com.example.app
  bundleId: com.example.app
```

Different package by environment:

```yaml
app:
  name: ExampleApp
  packageName: com.example.app
  bundleId: com.example.app
```

```yaml
app:
  packageName: com.example.app.staging
  bundleId: com.example.app.staging
```

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
- Detail the **Idempotent Prep** strategy (as described below) you intend to put at the start of `steps`.
- **Setup checklist:** List every `${variables.*}` and `${secrets.*}` the tests will use, and confirm the matching entries you will add to `.finalrun/env/*.yaml` (secret rows as `${ENV_VAR}` only).
- **Effective app checklist:** State which app identifier FinalRun should use for each env/platform affected by the change.
- **Inference checklist:** State which app identifiers were inferred from the repo, which files they came from, and whether any user confirmation is still needed.
- **Edge cases identified:** Present the edge cases discovered in Step 1B, grouped by category (state-dependent flows, empty states, validation errors). For each, briefly state the scenario and which UI behavior it exercises. Let the user select which ones to include in the test plan.

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

## Allowed Action Vocabulary

Every step you write in `steps` must map to one of the actions the runtime agent can perform. Use the natural-language verbs below; do not invent actions outside this list.

| Verb to use in steps | Runtime action | Needs a UI target? |
|---|---|---|
| **Tap** / Click | `tap` | Yes (which element) |
| **Long press** | `long_press` | Yes |
| **Type** / Enter text | `input_text` | Yes (which field) |
| **Swipe** / Scroll | `swipe` | Yes (area + direction) |
| **Navigate back** | `navigate_back` | No |
| **Go to home screen** | `navigate_home` | No |
| **Rotate device** | `rotate` | No |
| **Hide keyboard** | `hide_keyboard` | No |
| **Open URL / deeplink** | `deep_link` | No |
| **Set location** | `set_location` | Yes (coordinates) |
| **Wait** | `wait` | No |
| **Verify** / Check | Visual assertion (agent inspects the screen) | Yes (what to verify) |

> **"Verify" steps** are the one exception that is not a device action. They instruct the agent to visually inspect the current screen and confirm a condition. Use them at the start of `steps` to confirm idempotent prep worked, and later in `steps` to confirm intermediate states during the flow.

## Steps Must Start with Idempotent Prep

> [!IMPORTANT]
> **EVERY test's first steps MUST BE IDEMPOTENT prep.**
> The test must run successfully **regardless of the prior state of the app**. If a previous run changed data (added an item, enabled a setting), the leading steps MUST clean that up first before exercising the actual scenario.

**Prep is NOT redundant.** Even if the prep involves navigating to the same screens as the rest of the flow, you **MUST** include it.

| If the test validates... | The leading prep steps MUST... |
|---|---|
| **Adding** an item | Check if the item exists and **Delete/Remove** it first. |
| **Deleting** an item | Check if the item exists and **Add/Create** it first if missing. |
| **Enabling** a toggle | **Disable** the toggle first if it's already on. |
| **Moving/Reordering** | Ensure the list is in a **known default state** first. |

**Prep steps MUST include verification.** After each prep action, add a "Verify" step to confirm the app is in the expected starting state before proceeding to the scenario being tested. If prep fails, the test should fail early rather than produce a misleading failure later in the flow.

**Example — steps starting with idempotent prep:**
```yaml
steps:
  - "Navigate to the Shopping List screen"
  - "If the item 'Milk' is visible, swipe left on it and tap Delete"
  - "Verify that 'Milk' is no longer visible on the Shopping List screen"
  - "Tap the Add Item button"
  - "Type 'Milk' into the new item field and tap Save"
```

## Writing Good Test Flows
- **Be specific**: Reference actual UI labels and recognizable controls (e.g. Settings screen, Settings button).
- **Name visible controls clearly**: Use plain language like Save button and Home screen.
- **Variables**: Use syntax like "Type `${variables.search_term}` into the search field".
- **Idempotency is the priority**: Assume the test has already run and failed once; the leading prep steps must fix it.
- **Only use allowed actions**: Every step must map to an action from the **Allowed Action Vocabulary** table above. Do not write steps that require actions outside that list.
- **Verify intermediate states in steps**: When a multi-step flow depends on an earlier action succeeding (e.g. a form submission before checking a confirmation screen), add a "Verify" step between them to confirm the intermediate state.
- **Reserve `expected_state` for the final screen**: Do not put intermediate checks in `expected_state`. Use inline "Verify" steps in `steps` for intermediate validation instead.
- **Avoid verifying ephemeral UI (toasts, snackbars, transient banners)**: Short-lived messages disappear on their own timer (typically 2–5s) and race against the agent's verification step. Do not assert on them in `steps` or `expected_state`. Verify the persistent consequence instead (updated list, badge count, navigated screen, changed field value).

### Positional Context & Verification

The runtime agent enforces **positional strictness**: when a step specifies the location of a UI element, the agent treats the location as a strict assertion. If the element is not found at the described position, the test fails — the agent will not search elsewhere or substitute a different element.

**Use positional context when the element's location is part of the test:**
Include the position when the test verifies that a specific UI element exists at a specific place in the layout. Positional qualifiers include screen regions (top-left, bottom-right), container references (in the toolbar, in the header, in the navigation bar), relative positions (left of, right of, below, near the bottom), and ordinal positions (first, last).

```yaml
# Position matters — the test is verifying layout
steps:
  - Tap the hamburger menu icon in the top-left corner of the toolbar
expected_state:
  - The navigation drawer is open and visible on the left side of the screen
```

**Omit position when you only care that the element exists:**
When the test doesn't need to assert where an element appears, keep the step generic. The agent will scroll to find it.

```yaml
# Position doesn't matter — just find and tap it
steps:
  - Tap the Delete button
```

**Add explicit "Verify" steps before critical actions:**
When an action depends on a specific UI element being present (especially one with a positional qualifier), add a "Verify" step before it. This makes failures precise — a missing element is caught at verification rather than producing a confusing grounding error at the action step.

```yaml
steps:
  - Verify the hamburger menu icon is visible in the top-left corner of the toolbar
  - Tap the hamburger menu icon in the top-left corner of the toolbar
```

**Use positional descriptors in `expected_state` when layout matters:**
The agent matches spatial descriptions literally. "Visible on the left side" will NOT match a bottom sheet. "At the top of the drawer" will NOT match an item at the bottom.

```yaml
# Good — spatially precise
expected_state:
  - The navigation drawer is open and visible on the left side of the screen
  - The profile avatar is visible at the top of the drawer

# Bad — vague, could match unintended elements
expected_state:
  - The navigation drawer is open
  - The profile avatar is visible
```

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
steps:
  - <string>
expected_state:
  - <string>
```

**The two-phase execution model:** At runtime, the agent executes the test in two sequential phases: **Steps** (perform idempotent prep, then the user journey) → **Expected State** (verify the final screen). The test succeeds only if both phases pass.

**Instruction Guidelines for the specific keys:**
- **name:** Short unique identifier.
- **description:** High level summary of the user journey.
- **steps:** Chronological list of user interactions. The **first items** must be idempotent prep that guarantees a clean starting state (honoring the Idempotency rule), each followed by a "Verify" step confirming the prep worked. The remaining items are the user journey being tested. Name the target screen, button, field, or control directly in each step. Each step must use an action from the Allowed Action Vocabulary. Inline "Verify" steps may be used anywhere to confirm intermediate UI states.
- **expected_state:** The expected state of the UI **after all steps are complete**. These are **not actions to perform** — they are boolean conditions the agent checks against the final screen. If all conditions are met the test passes; if any fail the test fails. Do not include navigation or interaction instructions here.

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
