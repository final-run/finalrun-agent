## Why

The CLI currently exposes two different targeting patterns: spec runs use positional selectors, while suite runs require `--suite`. The documentation also tends to show full `.finalrun/tests/...` paths even though the implementation already resolves test selectors from the workspace root, which makes the common path feel more verbose than necessary.

We should standardize on a shorter, more predictable command shape before more examples and scripts reinforce the current split. The target standard is `finalrun test <spec-path>` for specs and `finalrun suite <suite-path>` for suites, with `.finalrun/tests` and `.finalrun/suites` remaining implicit roots.

## What Changes

- Add a top-level `finalrun suite <path>` command that resolves suite manifests from `.finalrun/suites/`.
- Standardize `finalrun test <path>` as the preferred way to run specs from `.finalrun/tests/` without requiring the `.finalrun/tests/` prefix.
- Update CLI help, README examples, and user-facing guidance to prefer short workspace-relative paths for both specs and suites.
- Keep `finalrun test --suite <path>` working as a compatibility path so existing scripts do not break immediately.

## Capabilities

### New Capabilities
- `simplified-run-invocation`: Standardizes short-form CLI commands for running specs and suites from implicit `.finalrun` workspace roots.

### Modified Capabilities
- None.

## Impact

- `packages/cli/bin/finalrun.ts` command definitions and help text
- `packages/cli/src/checkRunner.ts` and `packages/cli/src/testRunner.ts` suite invocation plumbing and command metadata
- CLI tests covering suite execution and selector resolution
- `README.md` and related usage examples
