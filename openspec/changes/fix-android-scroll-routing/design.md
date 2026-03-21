# Design

## Current State

The TypeScript scroll pipeline is already correct through grounding:

1. `HeadlessActionExecutor` calls the scroll grounder and parses a `ScrollAbsAction`
2. `Device.executeAction()` receives that action
3. `Device` always calls `_grpcClient.swipe(...)`

That works on iOS, where the driver server implements `Swipe`, but it fails on Android because the Android runner does not expose that RPC.

The Dart implementation takes a different approach in the device layer:

- Android: host-side `driver.scroll(...)`
- iOS: gRPC `swipe(...)`

This is the missing parity point in TypeScript.

## Decision

Match the Dart routing model in TypeScript instead of expanding the Android gRPC contract.

This is the preferred fix because it:

- stays entirely inside `finalrun-ts`
- uses infrastructure that already exists in the host environment (`adb`)
- matches the proven Dart behavior
- avoids taking a dependency on rebuilding and redistributing Android driver APKs before scroll can work

## Recommended Flow

```text
HeadlessActionExecutor
  -> Device.executeAction(SCROLL_ABS)
     -> Android: performAndroidSwipe callback
        -> DeviceManager.performAndroidSwipe(...)
        -> adb -s <serial> shell input swipe <x1> <y1> <x2> <y2> <durationMs>
     -> iOS: _grpcClient.swipe(...)
```

## DeviceManager Changes

Add a focused Android helper:

`performAndroidSwipe(adbPath, deviceSerial, params)`

Parameters:

- `startX`
- `startY`
- `endX`
- `endY`
- `durationMs`

Behavior:

- shell out to `adb -s <serial> shell input swipe ...`
- return a success/failure result with an optional message
- log enough context to diagnose device ID, coordinate, or ADB failures

This should live beside the existing Android helpers such as `openAndroidDeepLink()`.

## GrpcDriverSetup Changes

`GrpcDriverSetup` already injects host-side callbacks into `Device` for platform-specific actions:

- Android deep links
- iOS app enumeration
- iOS app-id refresh

Use the same pattern for Android scrolls.

For Android devices, provide a `performAndroidSwipe` callback that:

1. resolves `adbPath`
2. verifies `deviceInfo.id` is present
3. delegates to `DeviceManager.performAndroidSwipe(...)`

For iOS devices, leave this callback undefined.

## Device Changes

Extend `Device` with an optional Android host-side swipe callback.

`StepAction.SCROLL_ABS` should route as follows:

- if the device is Android and the callback is available, use the callback
- if the device is iOS, keep using `_grpcClient.swipe(...)`
- if the device is Android and the callback is missing, return a clear error instead of silently invoking the known-bad gRPC path

Returning a clear configuration error is important because it prevents regressions from resurfacing as transport-level `UNIMPLEMENTED` failures.

## Error Semantics

Android host-side swipe failures should be reported as normal action failures with useful messages, for example:

- ADB path unavailable
- Android device ID missing
- `input swipe` command failed

This keeps failures inside the normal `DeviceNodeResponse` flow instead of surfacing a low-level gRPC method error.

## Testing Plan

Add or update tests for:

- `DeviceManager.performAndroidSwipe()` producing the expected ADB command
- `GrpcDriverSetup` wiring the Android swipe callback only for Android devices
- `Device` using the callback for Android `SCROLL_ABS`
- `Device` continuing to use `_grpcClient.swipe(...)` for iOS `SCROLL_ABS`
- `Device` returning a clear error if Android scroll is requested without the callback

No goal-executor behavior change is required beyond the existing scroll flow already reaching `ScrollAbsAction`.

## Rejected Alternative

Implement Android gRPC `Swipe` in the device-side test app and keep the current TypeScript path unchanged.

That approach would also work, but it is not the recommended first fix for this repo because it:

- depends on changes outside `finalrun-ts`
- requires refreshed Android driver artifacts before the fix is usable
- does not address the missing Dart parity in the TypeScript port
