# Design

## Current State

The current TypeScript stack already has the broad shape needed for parity:

- `goal-executor` plans and executes a narrow CLI action vocabulary
- `common` defines `StepAction` models
- `device-node` routes actions into platform runtimes
- `GrpcDriverClient` already exposes more driver methods than the runtime currently uses

The main missing pieces are lower in the stack.

### Android today

- `AdbClient` only supports a small surface: port forwarding, install/uninstall, deeplink, and swipe
- Android runtime behavior still leans on gRPC for system actions where Dart uses adb
- `launchApp` still forwards directly to gRPC and does not execute all host-side prelaunch semantics
- `setLocation` does not yet model the Dart flow of host-side mock-location setup plus driver-side coordinate injection

### iOS today

- `SimctlClient` is still limited to install, open URL, terminate, list apps, and start driver
- iOS is missing host helpers for location, permission changes, physical buttons, cleanup flows, and app foreground/reset behavior
- `launchApp` still cannot fully honor `clearState` and only partially models the Dart behavior around app-state reset

### Action/model today

- `common` still does not define concrete TypeScript models for some parity primitives even though the gRPC client already exposes the underlying methods
- the planner surface has no `rotate` action
- `copyText` / `pasteText` are intentionally not part of this change

## Decisions

### 1. Transport parity comes first

The repo should first match the proven Dart transport behavior in the host adapters and runtime routing before exposing more planner actions.

That means:

- broaden `AdbClient`
- broaden `SimctlClient`
- move existing action behavior onto those host helpers where Dart already does

This gives the CLI a more reliable foundation without exploding the planner surface.

### 2. Keep the CLI surface narrow

Only one new planner-visible action is added in this change:

- `rotate`

The following remain internal parity primitives or transport capabilities only:

- `tapPercent`
- `eraseText`
- `getScreenshot`
- `getHierarchy`
- `runCommand`
- `toggleInternet`
- airplane mode helpers
- permission helpers
- cleanup helpers

This keeps the CLI prompt and action model focused on real test-case intent while still closing the runtime parity gap.

### 3. Exclude copy/paste

`copyText`, `pasteText`, `CopyTextAction`, and `PasteTextAction` are out of scope for this change, even though Dart and the driver surface may support them elsewhere.

### 4. Fix launch behavior as part of parity

`launch_app` is already a user-visible CLI behavior, so parity work must make it stop dropping intent.

This change must make `launch_app` honor:

- `stopAppBeforeLaunch`
- `clearState`
- host-owned setup work such as permissions, lifecycle, and reset behavior

If any platform-specific reset path cannot be completed reliably, the runtime must fail explicitly. It must not pretend success.

## Exact File Change Map

### Common / planner-facing files

- `packages/common/src/models/TestStep.ts`
  Add `PointPercent`, `TapPercentAction`, `EraseTextAction`, `RotateAction`, `GetScreenshotAction`, and `GetHierarchyAction`.
- `packages/common/src/index.ts`
  Export the new action models.
- `packages/common/src/constants.ts`
  Add planner constants only for `rotate`.
- `packages/goal-executor/src/prompts/planner.md`
  Add planner guidance and examples only for `rotate`.
- `packages/goal-executor/src/ai/AIAgent.ts`
  Parse and normalize the new `rotate` planner action.
- `packages/goal-executor/src/HeadlessActionExecutor.ts`
  Add direct execution for `rotate`. Do not add planner execution branches for the internal-only parity primitives.

### Android files

- `packages/device-node/src/infra/android/AdbClient.ts`
  Add the missing adb host helpers.
- `packages/device-node/src/device/android/AndroidDevice.ts`
  Move Android system-action routing and launch prelaunch steps onto adb where this design calls for host control.

### iOS files

- `packages/device-node/src/infra/ios/SimctlClient.ts`
  Add the missing simctl host helpers.
- `packages/device-node/src/device/ios/IOSSimulator.ts`
  Move iOS host-owned behavior onto simctl where this design calls for host control, and add launch prelaunch/reset handling.

### Shared device-node files

- `packages/device-node/src/device/shared/DeviceRuntime.ts`
  Add runtime methods for the new parity primitives and any new host-prelaunch hooks needed by launch behavior.
- `packages/device-node/src/device/shared/CommonDriverActions.ts`
  Wire the gRPC-backed parity primitives.
- `packages/device-node/src/device/Device.ts`
  Route the new `StepAction` types.

## Public Surface Changes

### `@finalrun/common`

Add concrete TypeScript models for:

- `PointPercent`
- `TapPercentAction`
- `EraseTextAction`
- `RotateAction`
- `GetScreenshotAction`
- `GetHierarchyAction`

Add planner constants only for:

- `rotate`

No new planner constants are added for the other transport or parity helpers.

### CLI behavior

No new CLI flags or commands are added.

User-visible CLI behavior changes are:

- planner can emit `rotate`
- `launch_app` becomes more faithful to requested restart/reset semantics
- existing system/navigation actions become more robust through host routing parity

## Android Design

### AdbClient additions

Add Dart-equivalent host helpers for:

- `runCommand`
- system key events, including back/home and mapped key presses
- `hideKeyboard`
- `rotate`
- `clearAppData`
- `forceStop`
- CLI app launch / foreground launch
- package and installed-app helpers needed by runtime checks
- permission and appops helpers
- battery-optimization helpers
- mock-location setup helpers
- internet and airplane-mode helpers

These helpers should return structured success/failure results with enough context to diagnose device or adb failures.

### Android runtime routing

Update Android runtime behavior to match Dart where practical:

- `back`, `home`, `hideKeyboard`, and mapped `pressKey` use adb
- unmapped `pressKey` can still fall back to gRPC if needed
- `scrollAbs` stays adb-backed
- deeplinks stay adb-backed
- `setLocation` becomes a two-step flow:
  1. adb host preparation for mock location
  2. gRPC `setLocation(...)` for the actual coordinates

### Android action matrix

For existing CLI actions and the new parity primitives, Android will behave as follows:

| Action | Android behavior in this change |
| --- | --- |
| `navigate_back` | Android-only planner action. Route through adb key event. |
| `navigate_home` | Route through adb key event. |
| `hide_keyboard` | Android-only planner action. Route through adb host helper. |
| `keyboard_enter` / mapped `pressKey` | Use adb for mapped/system keys, gRPC fallback for unmapped keys if still needed. |
| `swipe` / `SCROLL_ABS` | Keep adb `input swipe`. |
| `deep_link` | Keep adb deeplink flow. |
| `launch_app` | Use host-side prelaunch steps for stop/reset/permissions, then preserve the current TypeScript launch contract for the final app start. |
| `set_location` | Use adb mock-location prep plus gRPC `setLocation(...)`. |
| `rotate` | New planner-visible action. Route through adb host helper to match Dart. |
| `tapPercent` | Internal-only parity primitive. Add to `common` + `device-node`, not planner-visible. |
| `eraseText` | Internal-only parity primitive. Route through gRPC. |
| `getScreenshot` / `getHierarchy` | Internal-only parity primitives. Route through gRPC. |

### Android launch flow

The Android launch flow in this change is:

1. verify package/app presence using host-side app/package helpers as needed
2. if `stopAppBeforeLaunch` is true, force-stop the target app from the host
3. if `clearState` is true, clear app data from the host
4. if permission or appops work is requested, apply it from the host
5. preserve the current TypeScript launch contract for the final app start instead of fully replacing it with a new adb-only launch path in this change

#### Why not fully switch Android launch to adb here?

Dart has an adb CLI launch helper, and this change should add it for parity, but the current TypeScript `launchApp` contract already threads launch metadata through the driver path.

Replacing the entire final launch step with adb in the same change would enlarge scope and risk mixing transport parity work with a larger launch contract change. The safer decision is:

- add the adb launch helper now
- use host prelaunch steps now
- keep the final app-start step compatible with the current TypeScript launch contract

## iOS Design

### SimctlClient additions

Add Dart-equivalent host helpers for:

- foreground / CLI launch helpers
- uninstall
- location set/clear
- privacy permission grant/revoke/reset
- physical-button commands
- cleanup helpers such as uninstall-user-apps, clear clipboard, clear Safari data, and reset permissions

### iOS runtime routing

Update iOS runtime behavior to use simctl where Dart already does:

- deeplink stays simctl-backed
- installed app enumeration stays simctl-backed
- location moves to simctl-backed host control
- physical-button-style key routing uses simctl helpers
- app foreground/terminate/reset helpers use simctl

Keep the following on gRPC:

- tap
- enter text
- scroll
- hide keyboard
- rotate

`navigate_back` is not being added as an iOS-specific capability in this change. The planner remains Android-only for back navigation, matching the current CLI contract.

### iOS action matrix

For existing CLI actions and the new parity primitives, iOS will behave as follows:

| Action | iOS behavior in this change |
| --- | --- |
| `navigate_back` | No new iOS support is added. Planner remains Android-only for back. |
| `navigate_home` | Route through simctl physical-button helper instead of widening planner semantics. |
| `hide_keyboard` | No new planner change. Keep the current runtime behavior; this change does not broaden iOS keyboard-hide semantics. |
| `keyboard_enter` / `pressKey` | Use simctl for physical-button-style keys where applicable; keep gRPC for keyboard-entry-style keys. |
| `swipe` / `SCROLL_ABS` | Keep gRPC scroll/swipe behavior. |
| `deep_link` | Keep simctl deeplink flow. |
| `launch_app` | Refresh app IDs, run simctl/runtime prelaunch/reset work, then use the existing gRPC launch path. |
| `set_location` | Move to simctl-backed host control. |
| `rotate` | New planner-visible action. Keep gRPC-backed rotation. |
| `tapPercent` | Internal-only parity primitive. Add to `common` + `device-node`, not planner-visible. |
| `eraseText` | Internal-only parity primitive. Route through gRPC. |
| `getScreenshot` / `getHierarchy` | Internal-only parity primitives. Route through gRPC. |

### iOS launch flow

The iOS launch flow in this change is:

1. refresh installed app IDs
2. if `stopAppBeforeLaunch` is true, terminate the target app through simctl/runtime helpers
3. if `clearState` is true, attempt a Dart-style simulator app reset flow derived from the existing Dart behavior
4. if the simulator reset flow cannot reliably reconstitute the installed app, fail with a clear message
5. launch through the existing gRPC launch path with refreshed app IDs

This keeps iOS aligned with the current TypeScript contract while still making reset behavior real instead of silently ignored.

## Planner / Goal-Executor Design

### Add `rotate`

`rotate` becomes a first-class planner action.

Planner behavior:

- use `rotate` only when the test case explicitly requires orientation change
- treat it as a no-argument orientation toggle

Executor behavior:

- `HeadlessActionExecutor` adds a direct execution branch for `rotate`
- `rotate` does not require grounding

### Keep other parity primitives internal

Do not add planner verbs for:

- `tapPercent`
- `eraseText`
- `getScreenshot`
- `getHierarchy`
- any transport-only host helper

Those capabilities should exist in `common` and `device-node` for parity and future use, but not widen the planner contract in this change.

### Planner applicability clarifications

- `navigate_back` stays Android-only. This change does not attempt to invent a new iOS back contract.
- `hide_keyboard` also stays Android-only at the planner layer.
- `navigate_home` remains cross-platform, but the device-node implementation becomes platform-specific:
  - Android uses adb
  - iOS uses simctl
- `rotate` becomes cross-platform at the planner layer:
  - Android uses adb
  - iOS uses gRPC

## Testing Plan

Add or update tests for:

- `common` model serialization and exports for the new parity primitives
- planner parsing and executor behavior for `rotate`
- `Device` routing for the new action types
- `CommonDriverActions` wiring for the new runtime primitives
- `AdbClient` helper command shape and error handling
- `SimctlClient` helper command shape and error handling
- Android runtime routing for system actions, location prep, and launch preconditions
- iOS runtime routing for location, physical-button flows, launch preconditions, and reset behavior
- regression coverage for `launch_app`, `set_location`, `navigate_back`, `navigate_home`, `hide_keyboard`, and `keyboard_enter`

## Rejected Alternatives

### Expose every new host helper as a planner action now

Rejected because it would bloat the CLI action framework and mix low-level transport parity with user-facing test authoring in one change.

### Keep ignoring `clearState` / `stopAppBeforeLaunch`

Rejected because those are already part of the current TypeScript launch model and planner guidance. Leaving them silently ignored preserves incorrect behavior.

### Fully replace Android launch with adb-only launch in this change

Rejected because it is a larger contract change than transport parity alone. This change should add the host helper and prelaunch parity, but keep the final launch contract compatible with the current TypeScript behavior.
