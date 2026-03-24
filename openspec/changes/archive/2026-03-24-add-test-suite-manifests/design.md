# Design

## Current State

The repo already has the core execution behavior needed for suites:

- `packages/cli/src/testSelection.ts` expands multiple selectors, comma-delimited selectors, directories, and globs under `.finalrun/tests`
- `packages/cli/src/checkRunner.ts` resolves selectors into `LoadedRepoTestSpec[]`
- `packages/cli/src/testRunner.ts` already executes `checked.specs` sequentially in one shared device session and stops on first failure

This means suite support is primarily a new manifest and selection layer feature. The runner does not need a new orchestration model.

The report pipeline also already works at the batch level:

- `packages/cli/src/reportWriter.ts` writes:
  - `summary.json` for the compact summary
  - `run.json` as the richer report manifest
  - `index.html` for the per-run report page
- `packages/cli/src/runIndex.ts` rebuilds `.finalrun/artifacts/runs.json` and the root `index.html` from per-run `run.json` files
- `packages/cli/src/reportTemplate.ts` renders the per-run detail page from `RunManifestRecord`
- `packages/cli/src/reportIndexTemplate.ts` renders the root run-history page from `RunIndexRecord`

The current gap is contextual, not structural. Reports know about specs, but not about how that spec list was chosen.

## Decision

Add suite manifests under `.finalrun/suites` and resolve them into the same ordered spec list the runner already understands.

Use a separate CLI flag instead of overloading positional arguments:

- `finalrun check --suite <suite-path>`
- `finalrun test --suite <suite-path>`

Keep direct selector runs exactly as they work today.

## Workspace Layout

Recommended workspace shape:

```text
.finalrun/
  tests/
    login/
      valid_login.yaml
      invalid_login.yaml
    dashboard/
      smoke.yaml
  suites/
    login_suite.yaml
  env/
  artifacts/
```

`.finalrun/suites` is optional. It is only required when a command uses `--suite`.

## Suite Manifest Schema

V1 suite manifests should be intentionally small:

```yaml
name: login suite
tests:
  - login/valid_login.yaml
  - dashboard/**
  - profile/*
```

Rules:

- allowed keys: `name`, `tests`
- `name` is required and must be a non-empty string
- `tests` is required and must be a non-empty array of strings
- each `tests` item is interpreted using the existing selector grammar for `.finalrun/tests`
- relative paths stay rooted to `.finalrun/tests`, not to the suite file location
- duplicate matches are removed using first-seen ordering, same as the current selector engine
- explicit file items preserve manifest order
- directory and glob items expand in lexicographic file order because the existing selector engine sorts discovered files before matching

Out of scope for v1:

- `setup`
- `teardown`
- nested suite includes
- per-entry metadata such as tags, retries, or expected duration

## CLI Contract

Keep the current positional selector interface for ad hoc runs and add one suite flag.

Recommended surface:

```sh
finalrun check smoke.yaml auth/**
finalrun check --suite login_suite.yaml

finalrun test smoke.yaml auth/**
finalrun test --suite login_suite.yaml
```

Validation rules:

- `--suite` and positional selectors are mutually exclusive in v1
- `finalrun test` still requires an explicit target, which can now be either selectors or `--suite`
- `finalrun check` may still validate all direct specs when invoked with no selectors and no suite
- `finalrun check --suite <path>` validates the suite manifest and all resolved specs

Why `--suite` instead of a new `suite` subcommand:

- keeps the command surface small
- preserves the mental model that everything still resolves to a test run
- avoids overloading positional `.yaml` arguments with two different root directories and schemas

## Data Model Changes

Add a suite model in `packages/common`:

```ts
interface RepoTestSuite {
  name: string;
  tests: string[];
}

interface LoadedRepoTestSuite extends RepoTestSuite {
  sourcePath: string;
  relativePath: string;
  suiteId: string;
}
```

Extend the resolved check/test context and report model with explicit run-target metadata:

```ts
interface RunTargetRecord {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
}

interface RunManifestSuiteRecord {
  suiteId: string;
  suiteName: string;
  workspaceSourcePath: string;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  tests: string[];
  resolvedSpecIds: string[];
}
```

Notes:

- direct selector runs keep using `cli.selectors`
- suite runs store the authored suite entries under `input.suite.tests`
- `run.target` is the run-level summary used by the per-run page and the derived root index
- suite metadata belongs at the run level, not on every spec record
- this metadata should be carried into `run.json` and the derived `runs.json` entry

## Resolution Flow

Recommended resolution flow:

```text
CLI
  -> resolve workspace
  -> if --suite:
       load suite manifest from .finalrun/suites
       selectors = suite.tests
       target.type = suite
     else:
       selectors = normalized positional selectors
       target.type = direct
  -> selectSpecFiles(.finalrun/tests, selectors)
  -> load specs
  -> runTests(checked.specs)
```

Implementation sketch:

1. add `suitesDir` to `FinalRunWorkspace`
2. add `loadTestSuite()` alongside the current spec loader
3. extend `CheckRunnerOptions` with `suitePath?: string`
4. introduce a small helper to resolve the run selection and return:
   - normalized selector list
   - optional loaded suite metadata
5. keep `selectSpecFiles()` as the single source of truth for selector expansion

This preserves the current tested selector behavior instead of creating a second selector implementation for suites.

## Execution Behavior

Suite execution should keep current batch semantics:

- specs run sequentially in one shared device session
- execution order matches the resolved suite order
- the batch stops on the first spec failure
- artifact layout stays per-spec under `tests/<specId>/...`

This is important because the current runner and tests already guarantee the shared-session behavior. Suites should compose with that behavior, not replace it.

## Artifact Storage Changes

The suite feature should not change per-spec artifact ownership.

### Per-Spec Artifacts

Keep the current per-spec files exactly as they are:

```text
tests/
  <spec-id>/
    result.json
    recording.mp4
    steps/
      001.json
    screenshots/
      001.jpg
```

`tests/<spec-id>/result.json` remains a spec-execution artifact. It should not gain suite metadata in v1.

That keeps:

- spec drill-down files stable
- existing spec-oriented tooling unchanged
- suite context centralized at the run level

### Per-Run Input Snapshots

Add suite snapshots beside the existing environment and spec snapshots:

```text
input/
  run-context.json
  env.snapshot.yaml
  env.json
  suite.snapshot.yaml
  suite.json
  specs/
    <spec-id>.yaml
    <spec-id>.json
```

`suite.snapshot.yaml` is the authored YAML copied from `.finalrun/suites/<name>.yaml`.

`suite.json` is a normalized machine-readable record for the UI and tooling.

### Run Directory Layout

Expected suite-run directory shape:

```text
.finalrun/artifacts/<run-id>/
  index.html
  run.json
  summary.json
  runner.log
  input/
    run-context.json
    env.snapshot.yaml
    env.json
    suite.snapshot.yaml
    suite.json
    specs/
      <spec-id>.yaml
      <spec-id>.json
  tests/
    <spec-id>/
      result.json
      recording.mp4
      steps/
        001.json
      screenshots/
        001.jpg
```

For direct selector runs, `input/suite.snapshot.yaml` and `input/suite.json` are absent.

## Report Artifact Changes

The report needs to answer one additional question: "What produced this spec batch?"

Recommended artifact updates:

1. extend `RunManifestRecord.run` with a compact `target` block
2. add `input.suite` to `RunManifestRecord` for suite runs
3. extend `RunIndexEntryRecord` with a compact `target` block so the root run-history page can expose suite runs
4. optionally mirror the same metadata into `RunSummaryRecord` for compatibility, but `summary.json` is not the primary UI input anymore
5. when a run uses `--suite`, copy the suite YAML into the run directory so the report remains self-contained

Suggested `run.json` additions:

```ts
run.target: {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
}

input.suite?: {
  suiteId: string;
  suiteName: string;
  workspaceSourcePath: string;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  tests: string[];
  resolvedSpecIds: string[];
}
```

Recommended `runs.json` addition:

```ts
target?: {
  type: 'direct' | 'suite';
  suiteName?: string;
  suitePath?: string;
}
```

The root index needs only lightweight suite identity. It should not embed the full suite `tests` array.

## JSON Shape

### `run.json`

Recommended suite-run shape:

```json
{
  "schemaVersion": 1,
  "run": {
    "runId": "2026-03-24T08-10-11-dev-android",
    "success": true,
    "status": "success",
    "startedAt": "2026-03-24T08:10:11.000Z",
    "completedAt": "2026-03-24T08:10:53.000Z",
    "durationMs": 42000,
    "envName": "dev",
    "platform": "android",
    "model": {
      "provider": "openai",
      "modelName": "gpt-4o",
      "label": "openai/gpt-4o"
    },
    "app": {
      "source": "repo",
      "label": "repo app"
    },
    "selectors": [],
    "target": {
      "type": "suite",
      "suiteId": "login_suite",
      "suiteName": "login suite",
      "suitePath": "suites/login_suite.yaml"
    },
    "counts": {
      "specs": { "total": 4, "passed": 4, "failed": 0 },
      "steps": { "total": 31, "passed": 31, "failed": 0 }
    }
  },
  "input": {
    "environment": {},
    "suite": {
      "suiteId": "login_suite",
      "suiteName": "login suite",
      "workspaceSourcePath": ".finalrun/suites/login_suite.yaml",
      "snapshotYamlPath": "input/suite.snapshot.yaml",
      "snapshotJsonPath": "input/suite.json",
      "tests": [
        "login/valid_login.yaml",
        "dashboard/**",
        "profile/*"
      ],
      "resolvedSpecIds": [
        "login__valid_login",
        "dashboard__home",
        "dashboard__search",
        "profile__overview"
      ]
    },
    "specs": [],
    "cli": {
      "command": "finalrun test --suite login_suite.yaml",
      "selectors": [],
      "debug": false,
      "maxIterations": 50
    }
  },
  "specs": [],
  "paths": {
    "html": "index.html",
    "runJson": "run.json",
    "summaryJson": "summary.json",
    "log": "runner.log",
    "runContextJson": "input/run-context.json"
  }
}
```

Recommended direct-run shape:

```json
{
  "run": {
    "selectors": [
      "login/login.yaml",
      "dashboard/**"
    ],
    "target": {
      "type": "direct"
    }
  },
  "input": {
    "suite": null,
    "cli": {
      "selectors": [
        "login/login.yaml",
        "dashboard/**"
      ]
    }
  }
}
```

### `runs.json`

Recommended suite-run entry shape:

```json
{
  "runId": "2026-03-24T08-10-11-dev-android",
  "success": true,
  "status": "success",
  "startedAt": "2026-03-24T08:10:11.000Z",
  "completedAt": "2026-03-24T08:10:53.000Z",
  "durationMs": 42000,
  "envName": "dev",
  "platform": "android",
  "modelLabel": "openai/gpt-4o",
  "appLabel": "repo app",
  "specCount": 4,
  "passedCount": 4,
  "failedCount": 0,
  "stepCount": 31,
  "target": {
    "type": "suite",
    "suiteName": "login suite",
    "suitePath": "suites/login_suite.yaml"
  },
  "paths": {
    "html": "2026-03-24T08-10-11-dev-android/index.html",
    "runJson": "2026-03-24T08-10-11-dev-android/run.json",
    "log": "2026-03-24T08-10-11-dev-android/runner.log"
  }
}
```

This record is intentionally compact. It does not contain the full suite `tests` array.

## Report UI Changes

Keep the existing per-spec detail sections. Change the root run-history page and the top of the per-run report so suite context is visible without redesigning the whole UI.

### Root Run History Page

The root `.finalrun/artifacts/index.html` is now the first page users see. It is backed by `runs.json` and currently shows one row per run with status, run id, env, platform, spec counts, duration, first failure, and artifact links.

For suite support, make the run-history page show whether the run came from a suite:

- add a small `Target` column or inline label with `Suite` or `Direct`
- when the run came from a suite, show the suite name in the run row
- include the suite name and path in search/filter text so users can find runs by suite

This should stay lightweight. The history page is a browse page, not the place for the full suite manifest.

### Header

Add run-level context cards:

- `Run Target`: `Suite` or `Direct Selection`
- `Suite`: suite name when `target.type === 'suite'`
- `Suite Path`: relative path to the suite manifest when present

Retain the existing environment, platform, start time, duration, and artifact cards.

### Run Context Panel

The per-run report already has a `Run Context` table that shows selectors, variables, secrets, and spec snapshots.

For suite runs, extend that table instead of inventing a new top-level page section:

- replace the current `Selectors` row with a more general `Run Target` row
- add `Suite` and `Suite Manifest` rows when `target.type === 'suite'`
- show the raw ordered `tests` entries from the suite manifest exactly as authored
- include a link to the copied suite manifest snapshot
- keep variables, secrets, and spec snapshot rows unchanged

This gives users immediate visibility into what was requested before they inspect per-spec results.

### Spec Index

Keep the current spec table, but add an `Order` column so execution order is explicit.

Recommended columns:

- `#`
- `Spec`
- `Status`
- `Duration`
- `Path`

This matters more for suites because ordered batches are now a first-class concept.

### Per-Spec Detail Cards

Keep the current detail layout unchanged:

- one card per executed spec
- agent action timeline on the left
- session recording, screenshot, reasoning, trace, and raw links on the right

No suite-specific nesting is needed inside each spec card for v1.

### What Does Not Change

The existing per-spec UI remains the same:

- one detail card per executed spec
- the same agent action timeline and step selector behavior
- the same recording, screenshot, reasoning, trace, and raw artifact sections
- the same spec-level artifact structure under `tests/<specId>/...`

Suite support is run-context UI, not a redesign of per-spec drill-down.

## Testing Plan

Add or update tests for:

- workspace resolution including optional `.finalrun/suites`
- suite manifest loading and schema validation
- rejection of unsupported suite keys and empty `tests`
- suite path validation so suite files stay inside `.finalrun/suites`
- `check --suite` resolving and validating the expanded spec list
- `test --suite` reusing the shared-session runner behavior
- rejection when `--suite` is combined with direct selectors
- generation of `input/suite.snapshot.yaml` and `input/suite.json` for suite runs
- preservation of unchanged `tests/<spec-id>/result.json` files for executed specs
- `run.json` writing with suite metadata
- `runs.json` entry generation with suite metadata
- root run-history HTML rendering of suite/direct labels
- per-run report HTML rendering of suite metadata in the Run Context section and execution-order column

## Rejected Alternatives

### Allow suite manifests inside `.finalrun/tests`

Rejected because the current spec loader treats every YAML file in `.finalrun/tests` as a test spec and rejects unsupported keys. Mixing suite YAML and spec YAML in the same tree creates ambiguous semantics and unnecessary loader branching.

### Add a new `finalrun suite` subcommand

Rejected for v1 because it expands the CLI surface without changing the core execution model. `--suite` keeps suites aligned with the existing `check` and `test` flows.

### Add suite-level setup and teardown now

Rejected for v1 because the current spec schema and goal compiler only understand simple string-array `setup` sections and do not support teardown at all. Suite orchestration should land first; suite lifecycle hooks can be designed later with a clean schema.
