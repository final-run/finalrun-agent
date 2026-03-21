# Tasks

- [x] Add `performAndroidSwipe(...)` to `packages/device-node/src/device/DeviceManager.ts` so Android scrolls can execute through `adb shell input swipe`.
- [x] Thread an optional Android host-side swipe callback from `packages/device-node/src/grpc/GrpcDriverSetup.ts` into `packages/device-node/src/device/Device.ts`.
- [x] Route `StepAction.SCROLL_ABS` through the Android callback on Android and keep gRPC `swipe` for iOS.
- [x] Return a clear error when Android scroll is requested without the host-side swipe callback instead of falling through to the unimplemented gRPC method.
- [x] Add `Device` unit tests covering Android scroll callback routing, iOS gRPC routing, and the missing-callback error case.
- [x] Add `DeviceManager` or setup-level tests covering the ADB swipe command shape and Android callback wiring.
- [x] Run the relevant `packages/device-node` and `packages/goal-executor` test suites and fix any regressions uncovered by the new routing.
