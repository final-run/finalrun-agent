# Add Test Suite Manifests

## Why

`finalrun-ts` already supports ad hoc multi-spec execution by accepting multiple file, directory, and glob selectors under `.finalrun/tests`. That solves one-off reruns, but it does not solve a more important workflow: committing a reusable, ordered batch of tests to the repo.

Today teams must either:

- keep retyping the same selector list on the CLI
- rely on shell scripts outside the `.finalrun` workspace
- reorganize test files just to get a reusable batch boundary

That creates two gaps:

- there is no versioned suite manifest that says "these are the tests that define this flow"
- the current report UI and run-history UI cannot tell whether a run came from direct selectors or a named suite

## Proposed Change

Add repo-local test suite manifests under `.finalrun/suites`.

Suite format:

```yaml
name: login suite
tests:
  - login/valid_login.yaml
  - dashboard/**
  - profile/*
```

The implementation should:

- add `.finalrun/suites` as an optional workspace directory
- add a suite loader for YAML manifests with `name` and `tests: string[]`
- add `--suite <path>` support to `finalrun check` and `finalrun test`
- resolve each suite `tests` entry through the existing selector engine used for direct test runs
- preserve first-seen ordering and de-duplication across suite entries
- keep the current shared-session, sequential, fail-fast runner behavior for suite execution
- keep per-spec result artifacts unchanged and store suite data once per run under `input/`
- extend `run.json` with explicit suite-run metadata and add compact suite metadata to `runs.json`
- extend the run manifest and report UI so a suite run shows suite context and execution order clearly
- extend the root run-history UI so suite-originated runs are visible there too

## Scope

- workspace support for `.finalrun/suites`
- suite manifest models and validation
- CLI support for `--suite`
- selection resolution that reuses the current spec-selector semantics
- suite snapshot files under run artifacts
- run manifest, run-history, and per-run report updates for suite metadata
- README and test coverage updates

## Non-Goals

- suite-level setup or teardown
- nested suites or suite-to-suite includes
- mixing `--suite` with direct positional test selectors in v1
- parallel test execution
- suite-specific environment or platform overrides
- duplicating suite metadata into every spec `result.json`
- changing the existing per-spec execution detail layout in the report
