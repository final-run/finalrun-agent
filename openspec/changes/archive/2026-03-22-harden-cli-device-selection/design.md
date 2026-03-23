# Design

## Current State

The current selection path is built around a narrow contract:

- `packages/device-node/src/discovery/DeviceDiscoveryService.ts` returns `DeviceInfo[]`
- Android discovery only uses `adb devices -l` plus a small amount of `getprop` enrichment
- iOS discovery only uses `xcrun simctl list devices booted --json`
- `packages/cli/src/goalRunner.ts` only knows how to choose one already-runnable `DeviceInfo`
- `packages/cli/src/testRunner.ts` creates the report writer after device setup, so discovery and setup logs are not reliably persisted to `runner.log`

This is why the CLI cannot currently:

- show shutdown simulators or installed emulator targets
- let the operator pick between multiple matching devices
- start a chosen target from inside the run flow
- distinguish "nothing is connected" from "a tool is missing" or "a probe command failed"

## Decision

Keep the public CLI surface unchanged in v1 and improve device handling entirely inside the existing `finalrun test` path.

The first version is explicitly scoped to TTY runs:

- if multiple runnable targets exist, show a picker
- if no runnable targets exist but startable targets exist, show a picker for those targets and boot the selected one
- if no targets are usable, fail with raw system output and persist the same output in `runner.log`

Non-TTY behavior is deferred and should not be redesigned in this change.

## Shared Inventory Model

Add a new model file in `packages/common/src/models`, exported from the package barrel:

- `CommandTranscript`
- `DeviceInventoryDiagnostic`
- `DeviceInventoryEntry`
- `DeviceInventoryReport`

Recommended shapes:

### `CommandTranscript`

- `command: string`
- `stdout: string`
- `stderr: string`
- `exitCode: number | null`

This is the canonical raw system output block. The terminal and `runner.log` should render this text directly on failure.

### `DeviceInventoryDiagnostic`

- `scope: 'android-connected' | 'android-targets' | 'ios-simulators' | 'startup'`
- `summary: string`
- `blocking: boolean`
- `transcripts: CommandTranscript[]`

Use this for report-level reasoning such as missing tools, parse failures, or startup failures.

### `DeviceInventoryEntry`

- `selectionId: string`
- `platform: 'android' | 'ios'`
- `targetKind: 'android-device' | 'android-emulator' | 'ios-simulator'`
- `state: 'connected' | 'booted' | 'shutdown' | 'offline' | 'unauthorized' | 'unavailable'`
- `runnable: boolean`
- `startable: boolean`
- `displayName: string`
- `rawId: string`
- `modelName: string | null`
- `osVersionLabel: string | null`
- `deviceInfo: DeviceInfo | null`
- `transcripts: CommandTranscript[]`

Use `deviceInfo` only when the entry is immediately runnable by the existing setup path.

### `DeviceInventoryReport`

- `entries: DeviceInventoryEntry[]`
- `diagnostics: DeviceInventoryDiagnostic[]`

The CLI should derive runnable and startable subsets from `entries`, not from ad hoc booleans scattered across services.

## Device-Node Inventory Service

Replace the flat discovery-only responsibility with a richer service in `packages/device-node/src/discovery`.

Recommended public methods:

- `detectInventory(adbPath: string | null): Promise<DeviceInventoryReport>`
- `startTarget(entry: DeviceInventoryEntry, adbPath: string | null): Promise<DeviceInventoryDiagnostic | null>`

`DeviceNode` should expose these through new methods while keeping `setUpDevice(deviceInfo)` unchanged.

## Android Inventory

### Connected Android Probe

Use `adb devices -l` as the source of truth for attached Android targets.

Parse these states explicitly:

- `device`
- `offline`
- `unauthorized`

For `device` entries, enrich with:

- `adb -s <serial> shell getprop ro.product.model`
- `adb -s <serial> shell getprop ro.build.version.sdk`
- `adb -s <serial> shell getprop ro.build.version.release`
- `adb -s <serial> shell getprop ro.kernel.qemu`

If `ro.kernel.qemu == 1`, fetch the AVD name with:

- `adb -s <serial> emu avd name`

Inventory behavior:

- physical Android devices in `device` state are `runnable: true`, `startable: false`
- Android emulators in `device` state are `runnable: true`, `startable: false`
- `offline` and `unauthorized` entries are not runnable or startable, but they should still appear in transcripts and diagnostics when no usable targets exist

### Android Emulator Targets

Discover installed emulator targets even when they are not running.

Use:

- emulator binary resolution from the Android SDK
- `emulator -list-avds`
- `avdmanager list avd` when available
- AVD `config.ini` enrichment for model and `android-XX` labeling when needed

Inventory behavior:

- each installed AVD becomes an entry with `targetKind: 'android-emulator'`
- running emulators are represented by the connected probe, not duplicated as startable targets
- non-running AVDs are `runnable: false`, `startable: true`, `state: 'shutdown'`

Starting behavior:

- launch with `emulator -avd <name> -netdelay none -netspeed full`
- capture stdout/stderr in transcripts
- poll for a new connected emulator and boot completion
- use `sys.boot_completed == 1` as the boot gate
- after boot completes, rerun inventory and select the newly-runnable entry for the same AVD

Startup failure semantics:

- if launch command fails or boot never completes, add a blocking `startup` diagnostic with the captured transcript and stop before driver setup

## iOS Simulator Inventory

Use full simulator inventory instead of booted-only inventory:

- `xcrun simctl list -j`

Filter rules:

- keep only runtime buckets that represent iOS simulators
- ignore unavailable runtimes and unavailable devices
- ignore watch, TV, and other non-iOS runtime groups

Entry behavior:

- `state == Booted` -> `runnable: true`, `startable: false`, `state: 'booted'`
- `state == Shutdown` -> `runnable: false`, `startable: true`, `state: 'shutdown'`

Each entry should capture:

- simulator name
- UDID
- runtime-derived OS label such as `iOS 17.5`
- a `DeviceInfo` only for booted simulators

Starting behavior:

- `xcrun simctl boot <udid>`
- wait until `simctl` reports the device as booted
- rerun inventory and select the same UDID as a runnable entry

Do not add physical Apple-device inventory in this change.

## TTY Picker Flow

All selection behavior stays inside `packages/cli/src/goalRunner.ts`.

Recommended flow:

1. resolve `adbPath`
2. initialize `DeviceNode`
3. call `detectInventory(adbPath)`
4. optionally filter the inventory to `config.platform` if provided
5. derive:
   - `runnableEntries`
   - `startableEntries`
6. branch:
   - one runnable entry -> select automatically
   - multiple runnable entries -> show a numbered picker and select one
   - zero runnable and one startable entry -> start it automatically, then continue
   - zero runnable and multiple startable entries -> show a numbered picker for startable targets, then start the chosen one
   - zero runnable and zero startable -> fail using diagnostics or a plain "no usable targets found" message

Picker requirements:

- group runnable Android entries separately from runnable iOS entries
- only show startable targets when there are no runnable matches
- show each item with enough detail to differentiate similar targets
- use stable one-based numbering
- reprompt on invalid input

Recommended display label format:

- Android physical device: `<model> - Android <release> - <serial>`
- Android emulator: `<avdName or model> - Android <release or api> - <serial or avd>`
- iOS simulator: `<name> - <runtime label> - <udid>`

## Goal Runner Changes

Keep `runGoal` and the existing execution flow intact after selection.

Update `prepareGoalSession` to:

- work from `DeviceInventoryReport`
- call the picker when needed
- optionally start a selected target before setup
- pass the resulting runnable `DeviceInfo` into the existing `setUpDevice(deviceInfo)` path

Remove the current generic ambiguity error for interactive runs. The TTY picker becomes the only selection behavior covered by this change.

## Terminal Output and Raw Failure Rendering

Add a focused presenter in `packages/cli/src` for two responsibilities:

- render grouped numbered candidate lists
- render raw subprocess output on failure

Failure rendering rules:

- prepend a short heading such as `Device discovery failed` or `Device startup failed`
- print each captured transcript as-is:
  - command
  - stdout block
  - stderr block
- do not summarize or rewrite the subprocess output

Success-path logging should remain concise:

- detecting devices
- selected target
- starting selected target when needed
- setting up device

## Early Log Buffering and `runner.log`

Move logger setup earlier in `packages/cli/src/testRunner.ts`.

Recommended flow:

1. initialize `Logger` before `runCheck` and before `prepareGoalSession`
2. attach an in-memory sink that captures rendered log lines
3. when the report writer is created, flush the buffered lines into `runner.log`
4. then attach the normal report writer sink for the rest of the run

On failure before normal report initialization:

- create the failure run directory as today
- write buffered log lines into `runner.log`
- append any blocking discovery or startup transcripts to the same log
- keep the terminal failure output aligned with the same transcripts

This ensures the operator sees the same raw system output in both places.

## Testing Plan

Add or update tests for:

- Android connected-device parsing for ready, offline, and unauthorized states
- Android emulator-target discovery from SDK tools and AVD metadata
- iOS simulator inventory parsing for booted, shutdown, and unavailable devices
- Android emulator startup success and timeout/failure handling
- iOS simulator boot success and failure handling
- TTY picker behavior for:
  - one runnable target
  - multiple runnable targets
  - no runnable but multiple startable targets
  - invalid input then valid selection
- failure rendering so raw transcripts reach the terminal
- pre-report failure handling so buffered logs and raw transcripts reach `runner.log`

## Resolved Decisions

1. This change only covers interactive terminal runs.
2. All new behavior stays inside the existing `finalrun test` flow.
3. No new public commands or selectors are added in v1.
4. Device probe and startup failures print raw system output instead of rewritten summaries.
5. Physical Apple-device support remains out of scope.
