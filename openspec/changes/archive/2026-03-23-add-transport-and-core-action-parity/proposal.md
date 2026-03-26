# Add Transport And Core Action Parity

## Why

The TypeScript port still trails the working Dart device layer in two important ways:

- the host transport adapters are much thinner than Dart, especially for Android `adb` and iOS `simctl`
- a few core action/runtime primitives are still missing or partially wired in TypeScript

This creates concrete behavior gaps in the current CLI flow:

- `launch_app` still drops or under-executes `clearState` and `stopAppBeforeLaunch`
- Android system actions still rely too heavily on gRPC instead of the proven host-side adb path
- iOS is missing the simctl helpers Dart already uses for location, permissions, foregrounding, and cleanup
- TypeScript still lacks parity primitives like `tapPercent`, `eraseText`, `rotate`, `getScreenshot`, and `getHierarchy`

The result is that some behavior is less reliable than Dart today, and future parity work is blocked because the host transport foundation is incomplete.

## Proposed Change

Add host transport parity for Android and iOS, and add the minimum missing core action primitives needed to close the current TypeScript gap.

The implementation should:

- expand the Android adb adapter with the missing Dart-equivalent helpers for system keys, app lifecycle, permissions, mock location, internet/airplane mode, rotation, and command execution
- expand the iOS simctl adapter with the missing Dart-equivalent helpers for app foregrounding, uninstall/reset flows, location, permissions, physical buttons, and cleanup
- update Android and iOS runtime routing so existing CLI actions use the platform-appropriate host path where Dart already does
- add TypeScript action/runtime primitives for `tapPercent`, `eraseText`, `rotate`, `getScreenshot`, and `getHierarchy`
- expose only `rotate` as a new planner-visible CLI action in this change
- keep `navigate_back` and `hide_keyboard` Android-only at the planner layer
- keep `copyText` / `pasteText` out of scope
- keep the top-level CLI invocation unchanged with no new flags or commands

## Platform Split

| Action / Capability | Android | iOS |
| --- | --- | --- |
| `navigate_back` | Supported, routed via adb | Not added; stays out of scope |
| `navigate_home` | Routed via adb | Routed via simctl |
| `hide_keyboard` | Supported, routed via adb | No new planner support added |
| `pressKey` | adb for mapped/system keys, gRPC fallback if needed | simctl for physical-button keys, gRPC for keyboard-style keys |
| `swipe` / `SCROLL_ABS` | adb | gRPC |
| `deep_link` | adb | simctl |
| `launch_app` | adb-backed prelaunch steps, then current TS launch path | simctl-backed prelaunch/reset steps, then current gRPC launch path |
| `set_location` | adb mock-location prep + gRPC coordinates | simctl |
| `rotate` | New planner-visible action, routed via adb | New planner-visible action, routed via gRPC |
| Internal-only parity primitives | `tapPercent`, `eraseText`, `getScreenshot`, `getHierarchy` | `tapPercent`, `eraseText`, `getScreenshot`, `getHierarchy` |

## Scope

- `packages/common/src/models/TestStep.ts` and `packages/common/src/index.ts` for the new parity primitives
- `packages/common/src/constants.ts`, `packages/goal-executor/src/prompts/planner.md`, `packages/goal-executor/src/ai/AIAgent.ts`, and `packages/goal-executor/src/HeadlessActionExecutor.ts` for `rotate`
- `packages/device-node/src/infra/android/AdbClient.ts` and `packages/device-node/src/device/android/AndroidDevice.ts` for Android transport parity
- `packages/device-node/src/infra/ios/SimctlClient.ts` and `packages/device-node/src/device/ios/IOSSimulator.ts` for iOS transport parity
- `packages/device-node/src/device/shared/DeviceRuntime.ts`, `packages/device-node/src/device/shared/CommonDriverActions.ts`, and `packages/device-node/src/device/Device.ts` for shared runtime dispatch
- regression tests for transport behavior, launch behavior, and the new `rotate` path

## Non-Goals

- adding `copyText` / `pasteText` actions
- exposing `runCommand`, `toggleInternet`, airplane mode, or permission management as planner-visible CLI actions
- adding new top-level CLI flags or commands
- changing the device-side gRPC contract or rebuilding driver artifacts as part of this change
- broad architectural refactors unrelated to transport and action parity
