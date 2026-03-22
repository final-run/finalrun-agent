# Refactor Device Interaction Architecture

## Why

The current device-interaction code works, but it is difficult to read because the main concepts are interleaved:

- platform bootstrapping
- transport setup
- host-side tooling
- action execution
- screenshot readiness and recording

Today those concerns are spread across a small set of broad classes:

- `DeviceManager` mixes Android `adb`, iOS `xcrun simctl`, discovery, app install, deeplinks, and driver launch
- `GrpcDriverSetup` contains both Android and iOS startup flows in one class
- `Device` contains runtime action routing plus platform-specific branching and callback wiring

That structure makes it hard to answer simple questions like:

- which operations are gRPC on both platforms?
- which operations are host-side only?
- where does Android differ from iOS?
- what is the cleanup contract for a prepared device session?

## Proposed Change

Refactor the device layer around explicit platform backends and smaller infrastructure adapters.

The implementation should:

- split device discovery from device setup
- move discovery into a dedicated `DeviceDiscoveryService`
- keep `GrpcDriverSetup` as the public setup façade while extracting Android and iOS setup into dedicated internal collaborators named `AndroidDeviceSetup` and `IOSSimulatorSetup`
- replace the broad `DeviceManager` responsibilities with smaller adapters such as `AdbClient` and `SimctlClient`, with the goal of removing `DeviceManager` entirely
- keep gRPC behind a narrow driver RPC abstraction instead of letting it shape the top-level control flow
- keep `Device` as the single `Agent` wrapper returned to callers, but make it delegate platform behavior to explicit runtime classes such as `AndroidDevice` and `IOSSimulator`
- make session cleanup explicit, including platform-specific teardown responsibilities
- preserve the current CLI and executor APIs while improving internal readability

## Scope

- `packages/device-node/src/DeviceNode.ts`
- `packages/device-node/src/device/Device.ts`
- `packages/device-node/src/device/DeviceManager.ts`
- `packages/device-node/src/grpc/GrpcDriverSetup.ts`
- screenshot capture integration points
- recording integration points
- tests covering bootstrap, routing, and cleanup behavior

## Non-Goals

- changing the on-device Android or iOS driver binaries
- changing the protobuf contract as part of the first refactor
- adding new user-facing device capabilities
- adding physical iOS device support
- redesigning goal-executor prompts or planner behavior
