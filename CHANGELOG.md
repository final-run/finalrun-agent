# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.7] - 2026-04-20

### Added

- Per-feature model and reasoning effort selection via workspace YAML
- Mintlify community docs site with restructured Get Started (Intro, Installation, Quickstart) and a hero landing page
- `docs.finalrun.app` link surfaced in the README top nav and Documentation section

### Changed

- Slimmer planner hierarchy via Dart-aligned planner/grounder split for lower token cost
- Hardened per-feature model resolution and run-context capture
- Documented supported config shapes and per-provider reasoning levels
- Removed deprecated `toPromptElements` and unused hierarchy helpers

### Fixed

- Route OpenAI through the Responses API so `reasoningEffort` actually takes effect
- Pin Anthropic to `outputFormat` structured-output mode and enforce it via zod schema
- Drop the outer `output` wrapper and `.int()` from Anthropic schemas to satisfy the tool-schema validator
- Resolve per-feature provider/model in the post-merge summary logs

## [0.1.6] - 2026-04-15

### Added

- `/finalrun-test-and-fix` skill for running tests and fixing issues with proof
- Dedicated visual-grounding fallback feature with its own prompt
- Async per-step progress callback for listening to step-level execution updates
- Retry for planner and grounder LLM calls on transient failures
- Docs for auto-triggering FinalRun during development

### Changed

- Restructured planner prompt for clarity and stricter retry rules
- Generalized planner `thought.act` and broadened overlay handling
- Aligned planner retry rules with actual executor inputs
- Renamed verification bullet from "delete" to "item removal"
- Skill guidance to skip verifying ephemeral UI in generated tests
- Tightened Android driver retry preconditions

### Fixed

- Android back-to-back run UiAutomation bind failure
- Surface scrcpy SIGINT interruption instead of adb-push stdout noise
- Use absolute GitHub URLs for logo and demo GIF in READMEs

## [0.1.5] - 2026-04-11

### Added

- Per-test device log capture with a video-synced interactive UI, including search, log-level filter, and scrollbar
- Non-ASCII character input support for `enterText` and `pasteText`
- Curl-based install script for one-command FinalRun setup
- GitHub star notifier workflow

### Changed

- Restructured README for an onboarding-first experience; moved YAML tests, CLI reference, and configuration into dedicated docs
- Replaced `gpt-4o` with `gpt-5.4-mini` across the project
- Simplified `finalrun doctor` output to a tick/cross format
- Allocate, release, and clean up stale ports during test runs
- Updated `finalrun-use-cli` skill to fail fast and use `finalrun test` instead of the removed suite command
- Improved iOS gRPC driver recovery and log filtering
- Dropped internal-implementation references from `device-node` comments

### Removed

- `--suite` flag from `finalrun test`
- Redundant "launch the app" step from agent skills
- `avdmanager` from Android preflight checks and optional helper docs

### Fixed

- Hardened `enterText`/`pasteText` against shell injection and clipboard leaks
- Safer gRPC retry defaults, year inference, and log capture cleanup

## [0.1.4] - 2026-04-06

### Added

- Three-phase test execution model with `expected_state` (renamed from assertions)
- `.worktreeinclude` for auto-copying `.claude` and env files into worktrees
- Scaffolded `fab-kit` workspace

### Changed

- Updated planner prompts to handle popups and allowed recovery states
- Updated planner and skills with positional strictness rule
- Improved logging for better visibility across the executor
- Updated completion check logic
- Simplified README install blocks to a single `@latest` command
- Required Fab Kit workflow for agent-assisted PRs in contributing docs
- Tightened SRAD gate wording to mandatory in contributing docs

### Removed

- Removed openspec workspace

## [0.1.3] - 2026-04-05

### Added

- Top-level `finalrun start-server`, `finalrun stop-server`, and `finalrun server-status` workspace-aware server commands, plus `--workspace <path>` support for `runs`
- Interactive workspace selection for `start-server`, `stop-server`, `server-status`, and `runs` when the current shell is outside a FinalRun workspace
- Codebase walkthrough documentation

### Changed

- Renamed all internal spec/goal terminology to "test" across the codebase
- Renamed agent skills for a consistent `finalrun-` prefix
- Required repo app config and prelaunch primary app; flattened repo app config schema and hardened validation
- Simplified app naming across CLI and executor
- Updated planner to verify screenshot first; raised thinking level for planner to high and grounder to medium
- Increased default max iterations
- Clarified FinalRun prerequisites in docs
- Expanded Slack community link text in READMEs

### Fixed

- Fixed TTY issues when running from Claude Code and Cursor
- Fixed `readFirstLine` hanging on ended streams; propagated I/O errors
- Fixed `globToRegExp` to require directory boundary before `**` segments
- Cleaned up stale Android driver processes before setup
- Guarded optional artifact paths instead of force-unwrapping with non-null assertions
- Omitted YAML snapshot paths when no source file exists

### Removed

- Removed `finalrun report serve` as a breaking CLI change; use `finalrun start-server` instead
- Removed internal Dart references

## [0.1.2] - 2026-04-01

### Changed

- Added a stable package-root `README.md` for `@finalrun/finalrun-agent` so npm can render package documentation reliably
- Documented the `npx skills add final-run/finalrun-agent` setup flow for skill-enabled tools
- Updated README example model identifiers to use current supported model strings

## [0.1.1] - 2026-03-31

### Changed

- Aligned monorepo workspace package versions with `@finalrun/finalrun-agent` 0.1.1

## [0.1.0] - 2026-03-29

### Added

- Initial public release of the `@finalrun/finalrun-agent` npm package
- YAML-defined mobile app test execution for Android and iOS targets
- CLI commands for `check`, `test`, `doctor`, `runs`, and local report serving
- Local run artifact generation and report browsing support
- Open-source contributor, security, and issue/PR template documentation
