# Fix Android Scroll Routing

## Why

TypeScript already grounds scroll actions into absolute coordinates, but the Android execution path diverges from the working Dart behavior at the device layer.

Today:

- `HeadlessActionExecutor` produces a `ScrollAbsAction`
- `Device` routes every `SCROLL_ABS` action to gRPC `Swipe`
- the Android driver app used by FinalRun does not implement `Swipe`
- Android scrolls therefore fail with `12 UNIMPLEMENTED`

The scroll prompt is not the problem. The failure happens after grounding, when the action reaches device execution.

Dart avoids this exact issue by using a platform split:

- Android scrolls execute from the host via `driver.scroll(...)`
- iOS scrolls use gRPC `swipe(...)`

## Proposed Change

Restore the Dart-equivalent platform routing in TypeScript for `SCROLL_ABS`.

The implementation should:

- execute Android absolute scrolls from the host via ADB `input swipe`
- keep the existing gRPC `Swipe` path for iOS
- wire the Android host-side swipe through `GrpcDriverSetup -> Device -> DeviceManager` using the same callback pattern already used for Android deep links
- fail with a clear configuration error if an Android scroll is requested without the host-side swipe callback being available
- add regression tests so Android scrolls cannot silently fall back to the unimplemented gRPC path again

## Scope

- `packages/device-node/src/device/Device.ts`
- `packages/device-node/src/device/DeviceManager.ts`
- `packages/device-node/src/grpc/GrpcDriverSetup.ts`
- unit tests covering Android vs iOS scroll execution behavior

## Non-Goals

- changing the scroll grounder prompt or output format
- implementing Android `Swipe` inside the device-side driver app
- changing iOS scroll execution
- refactoring unrelated device actions onto new host-side callbacks
