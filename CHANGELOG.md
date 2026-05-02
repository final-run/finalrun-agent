# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.14] - 2026-05-02

### Fixed

- iOS `launchApp` could surface Android's `"Cannot launch: <bundleId>, maybe the app is not present"` on iOS-only runs. Both platforms started their gRPC port pools at the hardcoded `DEFAULT_GRPC_PORT_START` (50051), so on a host running both an Android emulator and an iOS simulator they collided on host loopback — whichever bound first held the port and the other platform's gRPC client connected to the wrong driver. Adds a shared `GrpcPortAllocator` (mutex + kernel bindability probe). iOS now allocates from `50151–50250`, disjoint from the Android pool (`50051–50150`); ports are released back on `prepare()` failure so per-process leaks are bounded to 100 slots.
- iOS `launchApp` now pre-checks the bundle id with `xcrun simctl listapps` (mirroring Android's `isPackageInstalled`) and returns an explicit `App not installed: <bundleId>` instead of the prior generic "maybe the app is not present" message. `SimctlClient.isAppInstalled` distinguishes a real simctl failure from a clean "not present" result, so transient simctl errors no longer get misreported as missing apps.
- Android driver/test-runner APK installs now auto-recover from `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (and similar state-conflict failures) by uninstalling the conflicting prior package and retrying once. Recovery is gated on the package already being on the device — if it isn't, the failure is something uninstall can't fix (storage full, ABI mismatch, USB drop) and we skip the retry to fail fast. Behavior is scoped to FinalRun-owned driver APKs via a new `AdbClient.installDriverApp` method; user-APK installs at `DeviceNode.installApp` keep no-recovery semantics so a failed user install never silently uninstalls the user's app.
- `finalrun cloud test/suite/upload --app <Foo.app>` failed for iOS simulator builds with `EISDIR: illegal operation on a directory, read` because `.app` is a directory bundle and `openAsBlob` tried to stream it. `prepareAppForUpload` (in `@finalrun/cloud-core`) now zips a `.app/` directory on the fly into a temp `<name>.app.zip` (which the server already accepts) and cleans the temp file in `finally`. Plain files pass through unchanged. The accepted `--app` shapes are tightened to `.apk`, `.app.zip`, or `.app/` directory; `.ipa` and arbitrary `.zip`/directories are rejected with clear errors instead of producing opaque upload failures downstream.

### Changed

- `finalrun cloud test` and `finalrun cloud suite` now forward the resolved non-secret `variables:` block from the active env YAML to cloud at submit time. Cloud records them on the run row so users (and the audit trail) can see what env values the run was executed against. Secrets are deliberately not forwarded.
- Internal refactor: `CliFilePathUtil` + `RuntimeAssetStore` + the asset cache moved from `@finalrun/finalrun-agent` to `@finalrun/device-node`; the `runCheck` pipeline (`checkRunner`, `env`, `appConfig`, `testLoader`, `testSelection`, `workspace`, `workspacePicker`) moved from cli to `@finalrun/common`. The cli's public API is unchanged via re-exports. The runtime-asset cache directory (`~/.finalrun/assets/<version>/`) now keys on device-node's version instead of cli's; they release in lockstep so the only consequence is a one-time cache invalidation on dev machines after this release.

## [0.1.13] - 2026-04-28

### Fixed

- Local report server never spawned in the Bun-compiled binary. `resolveCliLaunchArgs` walked `__dirname`-relative entrypoint candidates that don't exist on a user's machine and threw "Could not resolve a FinalRun CLI entrypoint for background report server startup." `tryStartReportServer` swallowed the throw silently, so `finalrun test` advertised a "Report server: …" URL that was actually a leftover process from an unrelated dev session, and `finalrun start-server` failed outright. The standalone-binary path now spawns `process.execPath` directly.
- Browser auto-launch after a test run did nothing. Same root cause: with no live report-server URL, the post-run `open <url>` handoff was never reached. Now that the server starts, Chrome (or whatever the macOS default browser is) opens to the run page on completion.
- `finalrun start-server` failed with "Could not find an open port near 4173" when the 4173–4192 window was occupied by leftover processes. The port-finder now falls back to an OS-assigned ephemeral port instead of erroring out.

### Changed

- `finalrun stop-server` is now a single command with no flags. It reaps every FinalRun report-server process owned by the current user (matched by `internal-report-server` argv marker, so the blast radius is bounded to processes the CLI itself spawns) and clears every leftover `.server.json` under `~/.finalrun/workspaces/`. The previous workspace-scoped behavior was fragile — orphans from crashed or older runs accumulated and there was no way to clean them without `pkill`.
- Spawn failures from `tryStartReportServer` and `openUrlBestEffort` now print to stderr instead of being swallowed, so regressions in the report-server pipeline surface within one run instead of two releases later.

## [0.1.12] - 2026-04-28

### Fixed — Planner crashing on `Prompt file not found` after device setup

After the v0.1.11 fix unblocked device setup, the very next phase failed: `Planner call failed: ... Prompt file not found for key "planner". Searched: /home/runner/work/finalrun-agent/finalrun-agent/packages/goal-executor/...`. Same class of bug as the existing `BUNDLED_CLI_VERSION` workaround in `runtimePaths.ts` — `__dirname` in a Bun-compiled binary points to the source path on the *build* machine (the GitHub Actions runner) rather than the deploy machine, so `AIAgent._loadPrompt`'s disk lookups all missed.

Fixed by shipping the AI prompt files (`planner.md`, `grounder.md`, the four sub-grounders, etc.) inside the runtime tarball under `prompts/`, alongside the existing `proto/`, `install-resources/`, and `report-app/` payloads — and by extending `initializeCliRuntimeEnvironment` in the CLI to set `FINALRUN_PROMPTS_DIR` from the runtime root. `_loadPrompt` already preferred that env var, so no behavior change there. Local dev still works because the `__dirname`-based fallbacks resolve correctly under `tsx`/`node`.

## [0.1.11] - 2026-04-28

### Fixed — Android/iOS test runs crashing on first proto load

`finalrun test` and `finalrun suite` aborted at device setup with `Run setup failed before execution: null is not an object (evaluating 'util.fs.readFileSync')` and a `SIGKILL`'d Android driver process. The crash hit every test run, not just first-install runs — the leading "Failed to clear app data" warning was harmless first-install noise and unrelated to the actual failure.

The root cause was inside `protobufjs` (transitively required by `@grpc/proto-loader` when the gRPC client loads `driver.proto`): it lazy-resolves `fs` and `long` via `@protobufjs/inquire`'s `eval("require")(name)` shim to dodge bundler static analysis. In a Bun-compiled standalone binary that `eval`'d `require` can't see the bundle's resolver, so `util.fs` came back `null` and any subsequent `util.fs.readFileSync(...)` blew up. (`util.Long` had the same shape and would have tripped `resolveAll` on the first int64 field.) Local development never reproduced because `tsx` / `node` / `bun run` all expose a real `require` to the eval.

Fixed by introducing `packages/device-node/src/grpc/protobufBundlerShim.ts`, a side-effect module that statically imports `node:fs` and `long` and assigns them onto `Protobuf.util`. `GrpcDriverClient.ts` imports the shim **before** `@grpc/proto-loader`, so the patch lands before proto-loader's transitive `protobufjs/ext/descriptor` import calls `Root.fromJSON(...).resolveAll()` at module-init time. Verified end-to-end against the wikipedia repo on a Bun-compiled darwin-arm64 binary: `Connected after 2 attempts (1s)` → `gRPC connection established successfully`.

## [0.1.10] - 2026-04-26

### Added — Windows x86_64 support

FinalRun now ships a `finalrun-windows-x64.exe` binary and a matching `finalrun-runtime-0.1.10-windows-x64.tar.gz` runtime bundle on every release.

End users on Windows install via PowerShell:

```powershell
irm https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.ps1 | iex
```

The Windows installer (`scripts/install.ps1`) mirrors the bash installer's structure: downloads the binary, extracts the runtime tarball, wires up the per-user PATH, and walks the user through Android tooling setup (Android Studio detection + `scrcpy` install via `winget` with a `choco` fallback). The iOS prompt is intentionally absent — iOS local execution requires `xcodebuild` (macOS-only). Cloud commands work the same on Windows for both Android and iOS.

`finalrun upgrade` now branches on platform: Windows hosts re-run `install.ps1` via `powershell.exe -Command "irm <url> | iex"`; macOS/Linux hosts continue to re-run `install.sh` via `bash -c "curl <url> | bash"`. Both honor the `--ci` flag.

Built via Bun's `bun-windows-x64` cross-compile target on the existing Linux-based release runner; no new CI infrastructure or code signing pipeline yet (Windows users will see a SmartScreen warning on first run — click "More info → Run anyway"). A new `smoke-windows` job in the release workflow runs the cross-compiled `.exe` on a real `windows-latest` runner before tagging, blocking the release if the binary fails to execute.

### Notes

- Windows ARM64 is not supported — Bun does not currently provide a `bun-windows-arm64` cross-compile target.
- `scripts/install.sh` continues to reject Windows hosts (Cygwin / MinGW / MSYS / Git Bash). Windows installs go through `install.ps1`, not the bash installer.
- The Windows runtime tarball is byte-equivalent to the Linux x64 tarball (Android-only payload); the existing `isDarwin` gate in `buildRuntimeTarball.mjs` correctly excludes iOS bundles for non-darwin targets.

## [0.1.9] - 2026-04-26

### Changed

- `finalrun upgrade` flag space mirrors the v0.1.8 installer: `--cloud-only` and `--full-setup` are removed in favor of `--ci`. When neither is passed, the upgrade mode is inferred from whether the local runtime tarball is currently installed (binary-only if not, full setup if yes).

### Fixed

- Cloud submissions (`cloud test`, `cloud upload`) drop the env file when the active environment comes from `.finalrun/config.yaml`'s `env:` default. The zip now ships `.finalrun/env/<envName>.yaml` whether the env is set via `--env` or resolved from config defaults. Regression introduced in v0.1.8 — the server-side check would 500 with `Environment "<name>" was requested, but .finalrun/env does not exist`.
- `LocalRuntimeMissingError` recovery hint no longer references the removed `install.sh --full-setup` flag — it now points at plain `curl … | bash` (full setup is the default).
- `install.sh` platform-prompt-exhausted warning no longer suggests "re-run without --ci" (that path is unreachable from `--ci` mode). It now suggests re-running the installer or running `finalrun doctor` to diagnose host tooling.

## [0.1.8] - 2026-04-25

### Changed — distribution model

The CLI is no longer published to npm. It now ships as a self-contained Bun-compiled binary plus a per-platform runtime tarball, both uploaded to GitHub Releases. End users install via:

```sh
# Full local-dev setup (binary + runtime tarball + platform tools + skills)
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash

# CI / non-interactive (binary only)
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash -s -- --ci
```

No Node.js required. CI environments (auto-detected via `CI=1`) skip the interactive setup automatically even without the `--ci` flag.

### Breaking — installer flags

The first cut of v0.1.8 shipped with `--cloud-only` and `--full-setup` flags plus TTY-detection that interacted badly with `curl | bash` (the script could hang mid-install when `exec </dev/tty` ran while bash was still reading the script body from the curl pipe). The flags have been simplified to a single `--ci` toggle and the script is now wrapped in a `main()` function so the redirect can never collide with bash's own script reading.

Migration:

| Old (will hard-error) | New |
|---|---|
| `bash -s -- --cloud-only` | `bash -s -- --ci` |
| `bash -s -- --full-setup` | `bash` (full is the default; drop the flag) |

### Added

- `@finalrun/cloud-core` workspace package: pure cloud-submission logic (zip + multipart POST, app upload), shared by the CLI binary
- `@finalrun/local-runtime` workspace package: builder for the per-platform `finalrun-runtime-<version>-<platform>.tar.gz` (driver bundles, gRPC proto, Vite SPA dist) that ships alongside the binary on GitHub Releases
- `finalrun upgrade` subcommand: re-runs the install script with sensible defaults (auto-detects whether the runtime tarball was previously installed; preserves `FINALRUN_DIR`)
- `--cloud-only` / `--full-setup` flags on `install.sh` for explicit override of the TTY auto-detection
- 30-minute fetch timeout on cloud submissions and app uploads (overridable via `FINALRUN_SUBMIT_TIMEOUT_MS` and `FINALRUN_UPLOAD_TIMEOUT_MS`); stalled connections surface as a clear "connection stalled" message instead of hung spinners
- `FINALRUN_REPORT_APP_DIR` and `FINALRUN_RUNTIME_ROOT` env vars for pointing the CLI at custom asset locations
- GitHub Actions `Release` workflow (manual `workflow_dispatch` trigger) that builds all 4 binaries + 4 runtime tarballs, tags the build commit, and creates the GitHub Release with all 16 artifacts
- `RELEASING.md` runbook documenting the manual release flow, pre-release tags, re-running failed jobs, local dry-run, and rollback

### Changed

- `FINALRUN_CLOUD_URL` default switched from `cloud-dev.finalrun.app` to `cloud.finalrun.app`. Override the env var to re-target dev infra.
- Cloud `cloud test` and `cloud upload` now stream the app file to the multipart body via `fs.openAsBlob` instead of `fs.readFileSync` — large APKs/IPAs no longer materialize into a single Buffer in memory
- Cloud `cloud test` ships only the env file matching `--env`, not every YAML under `.finalrun/env/` (was leaking other environments' bindings)
- `install.sh` rewritten: downloads the binary first, TTY-detects, runs interactive setup (platform prompt, brew installs, doctor verification, skills install) only when on a real terminal. Prompts have 30-second read timeouts that fall through to the conservative path. Brew install failures now correctly fail the setup step (previously short-circuited via `&& ok`).
- The CLI's `bin/finalrun.ts` now lazy-loads the heavy modules (`testRunner`, `doctorRunner`, `reportServer`, `reportServerManager`) so cloud commands don't pull them at startup. Local commands fail fast with `LocalRuntimeMissingError` and a recovery URL when the runtime tarball isn't installed.
- Test runner is now a portable Node script (`packages/cli/scripts/runTests.mjs`) walking `dist/` instead of `node --test "dist/**/*.test.js"` (which needs Node 21+ for native glob; we declare `>= 20.19`)

### Removed

- `npm install -g @finalrun/finalrun-agent` — no longer published. `packages/cli` is `private: true`. Existing npm-installed copies keep working until users `finalrun upgrade` or re-run the install URL.
- `packages/cli/scripts/installAssets.mjs`, `preparePackage.mjs`, `cleanupPackage.mjs` — npm-publication scripts no longer needed
- `packages/cli/package.json` no longer has `postinstall`, `prepack`, `postpack`, `bundleDependencies`, or `publishConfig`
- Client-side APK/IPA inspection in cloud submissions — server validates platform / packageName / simulator-compatibility authoritatively

### Fixed

- Bun-compiled binary's `__dirname` is the build-machine source path; resolving `package.json` via filesystem walk-up failed on every machine other than the one that built the binary. The CLI version is now read via `require('../package.json')` at module load (compiled to a CJS require by tsc and inlined into the bundle by Bun).
- Runtime tarball location now honors `$FINALRUN_DIR` (default `~/.finalrun`), matching the install script's convention. Previously the binary's resolver only checked `$HOME/.finalrun` regardless of where the install script extracted the tarball.
- Cloud submit/upload spinners no longer remain spinning after an unparseable JSON body or a server-side rejection — both paths now `spinner.fail` before rethrowing
- `install.sh` rejects `--cloud-only` and `--full-setup` together; refuses Windows hosts up front (Cygwin / MinGW / MSYS) instead of 404-ing on a non-existent `finalrun-windows-x64.exe`; validates the GitHub `/releases/latest` redirect target shape before parsing the tag
- Release workflow gained a `concurrency:` block (two simultaneous "Run workflow" clicks now queue rather than race on tag creation), strict semver regex on the version, origin tag-existence check (not just local), and `--latest` only when releasing from `main` with a stable (non-pre-release) version

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
