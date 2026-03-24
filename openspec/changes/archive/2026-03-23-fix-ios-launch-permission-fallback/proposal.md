# Fix iOS Launch Permission Fallback

## Why

The recent iOS transport-parity change introduced a launch regression:

- ordinary `launch_app` on iOS can now fail with `applesimutils is not installed. Please install it to manage permissions.`
- this hard failure now blocks app launch even though `applesimutils` is an optional third-party tool

At the same time, Apple already exposes a first-party subset of simulator permission automation through `xcrun simctl privacy`, and Maestro uses a best-effort pattern instead of making `applesimutils` a hard blocker.

The result is that `finalrun-ts` is stricter than it needs to be for normal iOS launch.

## Proposed Change

Make iOS launch permission preparation best-effort:

- keep plain iOS `launch_app` working without `applesimutils`
- use `simctl privacy` for the permissions Apple supports directly
- use `applesimutils` only opportunistically for the remaining unsupported permissions
- if `applesimutils` is absent, continue launch and surface a warning instead of failing the step
- keep Android behavior unchanged
- keep the existing `launch_app` contract unchanged

## Behavior Split

| iOS launch input | Host permission behavior | Launch result |
| --- | --- | --- |
| Default `allowAllPermissions=true` | Grant the Apple-supported subset through `simctl`; try `applesimutils` for the unsupported remainder | Continue launch even if `applesimutils` is missing |
| `allowAllPermissions=false` with no `permissions` | No host permission work | Continue launch |
| Custom permissions only in the Apple-supported subset | Apply via `simctl privacy` | Continue launch |
| Custom permissions including unsupported permissions | Apply the `simctl` subset; try `applesimutils` for the rest | Continue launch with warning if unsupported permissions were skipped |

## Scope

- `packages/device-node/src/infra/ios/SimctlClient.ts` to split iOS permissions into:
  - Apple-supported `simctl` permissions
  - optional `applesimutils` permissions
- `packages/device-node/src/device/ios/IOSSimulator.ts` to use the new best-effort permission preparation during launch
- `packages/device-node` tests covering fallback behavior and skipped-permission warnings

## Non-Goals

- changing Android launch behavior
- changing planner prompts or launch-action modeling
- guaranteeing every iOS permission can be pre-granted without `applesimutils`
- removing `applesimutils` support entirely
