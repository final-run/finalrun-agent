# Tasks

- [x] Extract Android host-side command execution from `packages/device-node/src/device/DeviceManager.ts` into a dedicated `AdbClient`-style module.
- [x] Extract iOS simulator command execution from `packages/device-node/src/device/DeviceManager.ts` into a dedicated `SimctlClient`-style module.
- [x] Move device discovery into `packages/device-node/src/discovery/DeviceDiscoveryService.ts` and remove `DeviceManager` once its responsibilities are fully extracted.
- [x] Keep `packages/device-node/src/grpc/GrpcDriverSetup.ts` as the public setup façade and extract `AndroidDeviceSetup` and `IOSSimulatorSetup` behind it.
- [x] Keep `_connectWithPolling(...)` in `GrpcDriverSetup` as the shared connection helper used by both setup classes.
- [x] Create a shared `DeviceRuntime` abstraction and a shared `CommonDriverActions` helper object that both platform runtime classes can reuse.
- [x] Implement `AndroidDevice` and `IOSSimulator` as the explicit runtime classes for Android and iOS behavior.
- [x] Keep `packages/device-node/src/device/Device.ts` as the stable `Agent` wrapper and refactor it to delegate platform behavior to `DeviceRuntime` instead of using callback threading and `isAndroid` branching.
- [x] Keep Android installed-app retrieval on driver gRPC and keep iOS installed-app retrieval on `SimctlClient`.
- [x] Move screenshot capture readiness and runtime capture orchestration behind a narrower capture-oriented dependency so bootstrappers and backends depend on clear contracts.
- [x] Make session teardown explicit, including Android port-forward cleanup and iOS runner termination responsibilities, while keeping driver-side `stopExecution()` behavior aligned with the current implementation.
- [x] Keep `DeviceNode`, `goalRunner`, and `goal-executor` public behavior stable while swapping the internal structure underneath.
- [x] Add or update tests for discovery, bootstrap, runtime routing, and cleanup on both platforms.
- [x] Run the relevant `packages/device-node`, `packages/cli`, and `packages/goal-executor` tests and fix regressions uncovered by the refactor.
