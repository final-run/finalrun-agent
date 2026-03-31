## 1. CLI Commands

- [x] 1.1 Add a top-level `finalrun suite <path>` command with the same run-oriented options as `finalrun test`.
- [x] 1.2 Route `finalrun suite <path>` through the existing suite resolution and execution flow while preserving `finalrun test --suite <path>`.
- [x] 1.3 Update CLI help and run-context metadata so suite runs record the actual command form the user invoked.

## 2. Behavior Coverage

- [x] 2.1 Add tests that prove `finalrun test login/auth.yaml` resolves against `.finalrun/tests` without requiring the workspace prefix.
- [x] 2.2 Add tests that prove `finalrun suite login/auth_suite.yaml` resolves against `.finalrun/suites` and executes the selected suite.
- [x] 2.3 Add compatibility tests that prove `finalrun test --suite login/auth_suite.yaml` continues to match the new suite command behavior.

## 3. Documentation

- [x] 3.1 Update `README.md` and CLI usage examples to standardize on `finalrun test <spec-path>` and `finalrun suite <suite-path>`.
- [x] 3.2 Document that `.finalrun/tests` and `.finalrun/suites` remain implicit roots and that explicit prefixed paths still work for compatibility.
