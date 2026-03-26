# finalruntestspec

`finalruntestspec` is an artifact-driven CLI for planning and generating FinalRun workspace tests. It keeps planning state under `frtestspec/changes/` and writes runnable artifacts into `.finalrun/tests/` and `.finalrun/suites/`.

## Quick Start

### Prerequisites

- Node.js `>= 20`
- npm

### Build

```bash
cd /Users/tamoyai/Development/finalrun-ts/finalruntestspec
npm install
npm run build
```

### Skill-First Setup For Codex

```bash
cd /path/to/your/repo
node /Users/tamoyai/Development/finalrun-ts/finalruntestspec/bin/frtestspec.js init --tool codex --command "node /Users/tamoyai/Development/finalrun-ts/finalruntestspec/bin/frtestspec.js"
```

If `frtestspec` is already available on your `PATH`, you can keep the configured backend command simple:

```bash
cd /path/to/your/repo
frtestspec init --tool codex
```

`init` creates:

- `frtestspec/config.yaml`
- `.codex/skills/frtestspec-plan/SKILL.md`
- `.codex/skills/frtestspec-generate/SKILL.md`
- `.codex/skills/frtestspec-validate/SKILL.md`

To refresh managed skills after updating `finalruntestspec`:

```bash
frtestspec update
```

After setup, ask Codex to use `frtestspec-plan`, `frtestspec-generate`, or `frtestspec-validate`.

### CLI Help

```bash
frtestspec --help
```

## Workflow

### 1. Plan A Campaign

Generate a planning-only campaign and draft a structured `test-plan.md`:

```bash
frtestspec plan login-flow "Create coverage for email/password login" --output tests,suites
```

Optional planning context:

```bash
frtestspec plan login-flow "Cover the updated login flow" \
  --output tests \
  --context-file src/login-screen.ts src/auth/api.ts
```

What `plan` does:

- creates `frtestspec/changes/<campaign>/test-plan.md`
- does **not** create `prompt.txt`
- does **not** create `ui-tests/`
- inspects existing `.finalrun/tests/` and `.finalrun/suites/`
- prefers formal specs when available, otherwise falls back to relevant code
- records discovered sources, proposed scenarios, and explicit file impact

The generated plan includes:

- `## Why`
- `## What Changes`
- `## Capabilities`
- `## Impact`
- existing coverage summary
- requested outputs
- proposed scenarios
- approval status

### 2. Approve The Plan

Review the generated plan, edit it if needed, then mark it approved in the frontmatter:

```bash
approval:
  status: approved
  approvedAt: 2026-03-24T12:00:00.000Z
```

`generate` will refuse to run until `approval.status` is `approved`.

### 3. Generate FinalRun Artifacts

Generate the approved artifacts into the FinalRun workspace:

```bash
frtestspec generate login-flow
```

Output locations:

- tests -> `.finalrun/tests/`
- suites -> `.finalrun/suites/`

If the approved plan marks an existing file as impacted, generation updates that file. If the approved plan marks coverage as new, generation creates a new file.

### 4. Validate Generated Artifacts

Validate the generated tests and suites declared in the approved plan:

```bash
frtestspec validate login-flow
```

Validation checks:

- test YAML structure under `.finalrun/tests/`
- suite YAML structure under `.finalrun/suites/`
- suite references stay inside `.finalrun/tests/`
- referenced test files exist

## File Layout

Planning artifacts:

```text
frtestspec/
  changes/
    login-flow/
      test-plan.md
```

Runnable FinalRun artifacts:

```text
.finalrun/
  tests/
    auth/
      login.yaml
  suites/
    login-flow.yaml
```

## Artifact Shapes

Test spec YAML:

```yaml
name: login_happy_path
description: Verify login with valid credentials.
preconditions:
  - User account exists
setup:
  - App is installed
steps:
  - Tap Login
  - Enter valid credentials
assertions:
  - Dashboard is visible
```

Test suite YAML:

```yaml
name: login_flow
description: Covers the approved login scenarios.
tests:
  - .finalrun/tests/auth/login.yaml
  - .finalrun/tests/auth/login-invalid-password.yaml
```

## Commands

```bash
frtestspec init --tool codex [--command "<backend-command>"]
frtestspec update
frtestspec plan <campaign-name> [request...]
frtestspec generate <campaign-name>
frtestspec validate <campaign-name>
```

## Development

```bash
npm run build
npm test
```

> [!NOTE]
> **Standardized Naming**: Information internal to this CLI has been standardized to use `suite` and `suites` instead of `testsuite`. The CLI looks for suites in `.finalrun/suites/`.
