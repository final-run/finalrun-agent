# Tasks

- [x] Add shared inventory, transcript, and diagnostic models in `packages/common` and export them from the package barrel.
- [x] Replace the flat device discovery contract in `packages/device-node` with an inventory service that reports runnable targets, startable targets, and blocking diagnostics.
- [x] Implement Android connected-target parsing for ready, offline, and unauthorized states, including model, SDK, release, and emulator-name enrichment.
- [x] Implement Android emulator-target discovery and startup support for installed AVDs that are not already running.
- [x] Replace booted-only iOS discovery with full simulator inventory parsing and add startup support for shutdown simulators.
- [x] Update `DeviceNode` and `goalRunner` so interactive `finalrun test` uses the inventory report, prompts the operator to choose from numbered device lists, and starts a chosen target when needed.
- [x] Add a terminal presenter for grouped device lists and raw failure transcript rendering.
- [x] Move logger initialization earlier in `testRunner`, buffer pre-report log lines in memory, and flush them into `runner.log` once the report writer exists.
- [x] Update failure-run artifact generation so discovery and startup failures persist buffered logs plus raw transcripts into `runner.log`.
- [x] Add or update unit and runner-level tests for inventory parsing, target startup, interactive selection, invalid-input reprompting, raw terminal failure output, and early-log persistence.
