# Tasks

- [x] Add `PointPercent`, `TapPercentAction`, `EraseTextAction`, `RotateAction`, `GetScreenshotAction`, and `GetHierarchyAction` to `packages/common`, and export them from the common barrel.
- [x] Add planner support only for `rotate` in `packages/common/src/constants.ts`, `packages/goal-executor/src/prompts/planner.md`, `packages/goal-executor/src/ai/AIAgent.ts`, and `packages/goal-executor/src/HeadlessActionExecutor.ts`.
- [x] Extend `packages/device-node/src/infra/android/AdbClient.ts` with the missing Dart-equivalent host helpers for system keys, app lifecycle, permissions/appops, mock location, internet/airplane mode, rotate, app/package checks, and `runCommand`.
- [x] Extend `packages/device-node/src/infra/ios/SimctlClient.ts` with the missing Dart-equivalent host helpers for foregrounding, uninstall/reset flows, location, permissions, physical buttons, and cleanup operations.
- [x] Wire the new parity primitives through `packages/device-node/src/device/shared/DeviceRuntime.ts`, `packages/device-node/src/device/shared/CommonDriverActions.ts`, and `packages/device-node/src/device/Device.ts`.
- [x] Update Android runtime routing so `navigate_back`, `navigate_home`, Android `hide_keyboard`, mapped `pressKey`, `rotate`, `set_location`, and `launch_app` use the adb-backed behavior described in the design.
- [x] Update iOS runtime routing so `navigate_home`, physical-button `pressKey`, `set_location`, foreground/reset behavior, and `launch_app` use simctl-backed behavior where specified, while `navigate_back` remains out of scope for iOS.
- [x] Ensure `launch_app` no longer silently ignores `clearState` or `stopAppBeforeLaunch`; it must either execute the requested behavior or fail explicitly.
- [x] Add unit and regression tests covering the new common models, rotate planner flow, adb/simctl helper behavior, runtime routing, launch behavior, and the existing CLI actions affected by the new transport paths.
- [x] Run the relevant `packages/common`, `packages/goal-executor`, and `packages/device-node` test suites and fix any regressions uncovered by the parity changes.
