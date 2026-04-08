# FinalRun Cloud Runs

## Overview

FinalRun supports running tests on cloud-based devices in addition to local execution. Cloud runs follow the same CLI-first architecture — tests are authored locally, triggered via CLI, and executed remotely on cloud devices.

Cloud runs are **immutable and reproducible**. Re-running requires executing the CLI command again. There is no way to re-trigger a run from the UI.

---

## Requirements

### Run Visibility & Tracking
- Display list of all runs with status (`queued`, `running`, `completed`)
- Show real-time updates for currently running executions
- Include metadata: start time, duration, trigger source (CLI command)

### Progress Tracking
- Show overall progress (e.g. 6/10 tests passed, 60%)
- Display per-test execution status (`pending`, `running`, `completed`)
- Update progress in real-time as tests execute

### Test Case Details
- List all test cases within a run in execution order
- Show status, duration, and file path for each test
- Allow expanding a test case to view steps, logs, and artifacts

### Step-Level Visibility
- Display all steps within a test case in execution order
- Show step-level status
- Highlight the exact step where failure occurred

### Artifacts
- Capture and display screenshots for each step
- Record and provide video playback for each test case
- Artifacts are mapped to their steps and tests for debugging

### Suite & Structure Representation
- Show logical structure of suites and their test cases
- Preserve execution order defined in the suite file
- Allow users to understand grouping of test cases

---

## Data Model

### `runs`

Represents a single CLI-triggered upload and its full execution lifecycle.

```
runs
----
id (PK)
org_id (FK → orgs)
fr_user_id (FK → users)
command              -- e.g. "finalrun cloud tests/auth/"
zip_url              -- S3 path of uploaded zip
status               -- parsing | queued | running | completed
total_tests          -- set after parsing
completed_tests      -- incremented as tests finish
created_at
started_at
completed_at
updated_at
```

**Notes:**
- Each run is immutable — re-run requires triggering CLI again
- `zip_url` is the source of truth for the uploaded project snapshot
- `total_tests` and `completed_tests` are denormalized for fast progress queries

---

### `run_nodes`

Represents every suite and test case within a run. Self-referencing to support the suite → tests hierarchy.

```
run_nodes
---------
id (PK)
run_id (FK → runs)
parent_id (FK → run_nodes)   -- null = top-level node
type                          -- 'suite' | 'test'
name                          -- from YAML name field
file_path                     -- e.g. tests/auth/login_test.yaml
order_index                   -- execution order, relative to siblings
status                        -- queued | running | completed | skipped
error_message                 -- failure reason
total_tests                   -- suites only
completed_tests               -- suites only
video_url                     -- tests only
content JSONB                 -- full parsed YAML, stored at upload time
started_at
completed_at
updated_at
```

**Notes:**
- Created server-side after extracting the zip and parsing YAML specs — full tree is always visible before execution starts
- `order_index` is relative to siblings under the same `parent_id`
- `path` stores the full position in the tree (e.g. `001.002`) for correct flat ordering without recursive queries
- `content JSONB` is populated server-side by parsing specs from the uploaded zip — the AI runner reads steps directly from here, no ZIP download needed at execution time
- `total_tests` and `completed_tests` are only meaningful for `type='suite'`
- `video_url` is only populated for `type='test'`

---

### `run_steps`

Represents actual AI actions taken during test execution. Not 1:1 with YAML steps — the AI decides how many actions to take per YAML instruction.

```
run_steps
---------
id (PK)
run_node_id (FK → run_nodes where type='test')
step_index           -- global order within the test execution
yaml_step_index      -- maps back to the YAML step array position
description          -- what the AI decided to do
screenshot_url
logs
status               -- passed | failed
executed_at
```

**Notes:**
- Created dynamically as the AI executes — not pre-populated from YAML
- `yaml_step_index` maps AI actions back to the originating YAML instruction so the UI can group them
- Multiple `run_steps` rows may share the same `yaml_step_index` (one YAML instruction → many AI actions)

---

## CLI Command

### Command

```
finalrun cloud [selectors...]
```

### Arguments

| Argument | Description |
|---|---|
| `selectors` | Workspace-relative YAML files, directories, or globs under `.finalrun/tests/` |

### Options

| Option | Description |
|---|---|
| `--env <name>` | Environment name |
| `--platform <platform>` | Target platform (`android` or `ios`) |

### Examples

```bash
# Run a suite file
finalrun cloud tests/regression_suite.yaml

# Run a single test
finalrun cloud tests/auth/login_test.yaml

# Run all tests in a directory (recursive)
finalrun cloud tests/auth/

# Run multiple selectors
finalrun cloud tests/auth/ tests/checkout/payment_test.yaml

# Run with glob
finalrun cloud "tests/**/*.yaml"
```

### Implementation

The `cloud` command is added to `packages/cli/bin/finalrun.ts` as a top-level command, consistent with `test` and `check`. Business logic lives in a new `packages/cli/src/cloudRunner.ts`, keeping `finalrun.ts` as a thin entry point.

---

## File Type Inference

All test and suite files live under `.finalrun/tests/`. There is no dedicated suites directory — a suite file is simply a YAML file with a `tests:` key.

The CLI determines file type by parsing the YAML:

| Key present | Type |
|---|---|
| `steps:` | Test |
| `tests:` | Suite |

This works regardless of where the file lives within `.finalrun/tests/`, including nested subdirectories.

### Suite Constraints (v1)

- Suites are flat — the `tests:` array contains only plain string test file paths
- Suites referencing other suites are not supported in v1
- The schema is designed to support nested suites in a future version without breaking changes — a `- suite: path` entry syntax can be added to the `tests:` array alongside plain string test paths

---

## Upload Flow

When `finalrun cloud` is executed, the CLI performs the following steps:

### Step 1 — Resolve Workspace

Locate the `.finalrun` directory by walking up from the current working directory. This logic is built into the compiled CLI binary — the `finalrun-agent` source code does not need to be present. The CLI can be run from any project that has a `.finalrun/` directory, as long as the `finalrun` binary is installed globally via npm.

### Step 2 — Collect and Parse Files

Use the existing `selectSpecFiles()` to collect all YAML files matching the provided selectors, with full support for:
- Single file paths
- Directories (recursive)
- Globs
- Comma-separated selectors

Parse each collected file to determine its type (`steps:` = test, `tests:` = suite).

For each suite file, load the test files referenced in its `tests:` array.

### Step 3 — ZIP and Upload

Create a ZIP of the `.finalrun/` directory, **excluding env files** (`.finalrun/env/*.yaml`). Env files contain mappings to local secret environment variables and are never relevant to cloud execution.

Upload the ZIP to S3 and store the resulting `zip_url`.

### Step 4 — POST Payload to API

Send `{command, zip_url}` to the FinalRun API. The server extracts the zip, parses the YAML specs using the CLI's spec parser, builds the node tree (suites and tests), validates secrets against the org's cloud configuration, and creates the `runs` row and all `run_nodes` rows in a single transaction.

### Step 5 — Print Run URL

Output the cloud run URL to the terminal so the user can track progress.

```
✔ Run created: https://app.finalrun.io/runs/abc123
```

---

## Upload Payload

```json
{
  "command": "finalrun cloud tests/regression_suite.yaml",
  "zip_url": "s3://finalrun/uploads/abc123.zip"
}
```

**Key points:**

- The payload is minimal — only the CLI command and a reference to the uploaded zip
- The cloud server extracts the zip, parses the YAML specs, and builds the node tree (suites, tests, hierarchy) server-side using the same CLI spec parser
- `command` contains the selectors so the server knows which tests to run from the zip
- Secret validation happens server-side after parsing — the server checks all `${secrets.*}` references against the org's configured secrets
- Env files are excluded from the ZIP and never sent to the cloud

---

## Secrets Handling

Secrets are pre-configured in the FinalRun cloud dashboard, scoped to the org.

- YAML files reference secrets as `${secrets.key}` placeholders
- These placeholders are preserved as-is in `content JSONB` on `run_nodes`
- At execution time, the cloud runner resolves placeholders from the org's stored secrets — the same way the local CLI resolves them from environment variables
- Env files (`.finalrun/env/*.yaml`) are never uploaded — they are only relevant locally for mapping secret keys to env var names
- If a test references a secret that has not been configured in the cloud dashboard, the upload is aborted at Step 4 with a clear error listing the missing secrets
