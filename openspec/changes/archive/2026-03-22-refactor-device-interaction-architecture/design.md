# Design

## Current State

The current device-interaction path is structurally correct but conceptually dense:

```text
goalRunner
  -> DeviceNode
  -> GrpcDriverSetup
     -> DeviceManager
     -> GrpcDriverClient
  -> Device
     -> ScreenshotCaptureHelper
     -> RecordingManager
```

The problems are mostly organizational:

1. `DeviceManager` is too broad.
   It currently owns:
   - Android discovery
   - iOS simulator discovery
   - Android app install
   - iOS app install
   - Android deep links
   - iOS deep links
   - Android swipe
   - iOS app listing
   - iOS runner launch

2. `GrpcDriverSetup` is really two bootstrappers in one file.
   The Android path and iOS path have different startup mechanics, different failure modes, and different post-connect initialization.

3. `Device` contains platform policy.
   The `Agent` implementation currently knows whether an operation should go through gRPC, `adb`, or `xcrun`, which makes the runtime action path harder to follow.

4. Transport and capability boundaries are implicit.
   The code exposes concepts like `gRPC`, `adb`, and `xcrun` earlier than necessary, so readers have to understand tooling details before they can understand product behavior.

5. Cleanup is not a first-class concept.
   Setup is explicit; teardown is comparatively diffuse. That makes session lifecycle harder to reason about.

## Design Goals

1. Make platform differences visible in module boundaries instead of hidden in branches.
2. Make use cases readable without first understanding shell commands.
3. Keep `grpc`, `adb`, and `xcrun` as infrastructure details.
4. Preserve current behavior during the first refactor.
5. Make session setup and teardown symmetrical.

## Recommended Architecture

The best organization for this codebase is:

- public API organized around device capabilities
- internal implementation organized around platform backends
- host tooling and transport isolated behind narrow adapters

This is better than organizing the code by transport alone.

If the repo were organized only as `grpc/`, `adb/`, and `xcrun/`, a reader would still need to jump across multiple folders to understand a single use case like scroll, launch app, or deep link. The cleaner model is:

```text
executor / CLI
  -> Device
     -> platform runtime class
        -> driver RPC adapter
        -> host tooling adapter
```

## Proposed Module Split

```text
packages/device-node/src/
  discovery/
    DeviceDiscoveryService.ts

  grpc/
    GrpcDriverSetup.ts
    setup/
      AndroidDeviceSetup.ts
      IOSSimulatorSetup.ts
    DriverRpcClient.ts

  infra/android/
    AdbClient.ts

  infra/ios/
    SimctlClient.ts

  device/shared/
    DeviceRuntime.ts
    CommonDriverActions.ts

  device/android/
    AndroidDevice.ts

  device/ios/
    IOSSimulator.ts

  capture/
    ScreenshotCaptureCoordinator.ts

  recording/
    RecordingManager.ts
    AndroidRecordingProvider.ts
    IOSRecordingProvider.ts
```

The exact folder names can vary, but the separation should hold.

## Responsibility Split

### 1. Discovery Layer

Recommended class:

- `DeviceDiscoveryService`

Responsibilities:

- detect Android devices via `adb`
- detect iOS booted simulators via `xcrun simctl`
- return `DeviceInfo`

This layer should not install apps, start drivers, or open deep links.

### 2. Bootstrap Layer

Recommended classes:

- `AndroidDeviceSetup`
- `IOSSimulatorSetup`
- `GrpcDriverSetup`

Responsibilities:

- prepare driver artifacts
- install the platform-specific driver
- set up transport
- wait for readiness
- return a prepared platform device

`GrpcDriverSetup` can stay.

That class name is still reasonable because it is the setup entrypoint and its job is still gRPC driver setup.

The recommended change is to keep `GrpcDriverSetup` as a façade and move the platform-specific logic out of the file into:

- `AndroidDeviceSetup`
- `IOSSimulatorSetup`

So the external call path remains simple:

```text
DeviceNode
  -> GrpcDriverSetup
     -> AndroidDeviceSetup | IOSSimulatorSetup
```

### 3. Infrastructure Adapters

Recommended adapters:

- `DriverRpcClient`
- `AdbClient`
- `SimctlClient`

Responsibilities:

- `DriverRpcClient`: only driver RPC calls
- `AdbClient`: only host-side Android shell operations
- `SimctlClient`: only host-side iOS simulator operations

These adapters should be thin and command-focused.

Examples:

- `AdbClient.installApk(...)`
- `AdbClient.forwardPort(...)`
- `AdbClient.openDeepLink(...)`
- `AdbClient.swipe(...)`

- `SimctlClient.installApp(...)`
- `SimctlClient.openUrl(...)`
- `SimctlClient.listInstalledApps(...)`
- `SimctlClient.launchRunner(...)`
- `SimctlClient.terminateApp(...)`

This is much easier to scan than a single `DeviceManager` that does everything.

### 4. Platform Runtime Implementations

Recommended runtime classes:

- `AndroidDevice`
- `IOSSimulator`

Recommended shared abstraction:

```ts
interface DeviceRuntime {
  tap(params: ...): Promise<DeviceNodeResponse>;
  enterText(params: ...): Promise<DeviceNodeResponse>;
  scrollAbs(params: ...): Promise<DeviceNodeResponse>;
  launchApp(params: ...): Promise<DeviceNodeResponse>;
  openDeepLink(url: string): Promise<DeviceNodeResponse>;
  getInstalledApps(): Promise<DeviceAppInfo[]>;
  captureState(traceStep?: number | null): Promise<DeviceNodeResponse>;
  startRecording(...): Promise<DeviceNodeResponse>;
  stopRecording(...): Promise<DeviceNodeResponse>;
  close(): Promise<void>;
}
```

This is the key design decision.

The platform runtime owns platform policy:

- Android scroll uses `AdbClient.swipe(...)`
- iOS scroll uses `DriverRpcClient.swipe(...)`
- Android deep links use `AdbClient.openDeepLink(...)`
- iOS deep links use `SimctlClient.openUrl(...)`
- iOS app listing uses `SimctlClient.listInstalledApps(...)`
- Android app listing uses driver RPC if that is still the correct runtime source

That eliminates the need for callback injection from setup into `Device`.

### 5. Thin Agent Adapter

`Device` should remain.

`Device` is the object that callers already understand and the object that `DeviceNode` can store in the pool. It should continue to implement `Agent`, own `DeviceInfo`, and act as the stable orchestration wrapper around one prepared runtime instance.

The shape should look like this:

```text
Device
  -> owns DeviceInfo + DeviceSession + DeviceRuntime
  -> delegates platform behavior to AndroidDevice | IOSSimulator
  -> does not choose adb vs xcrun vs grpc directly
```

This answers the orchestration question cleanly:

- `DeviceNode` orchestrates selection and pooling
- `GrpcDriverSetup` orchestrates setup
- `Device` orchestrates runtime interaction for one prepared device
- `AndroidDevice` or `IOSSimulator` implements platform behavior underneath

## Exact Dispatch Logic

This is the exact place where decisions happen.

There are two separate decisions:

1. which platform object to create
2. which transport/tool that platform object uses for a given capability

### Decision 1: Android or iOS?

This is decided once during setup from `DeviceInfo.isAndroid`.

The logic should live in `GrpcDriverSetup.setUp(deviceInfo)`:

```ts
async setUp(deviceInfo: DeviceInfo): Promise<Device> {
  const rpcClient = this._grpcClientFactory();

  const runtime = deviceInfo.isAndroid
    ? await this._androidDeviceSetup.prepare(deviceInfo, rpcClient)
    : await this._iosSimulatorSetup.prepare(deviceInfo, rpcClient);

  return new Device({
    deviceInfo,
    runtime,
    session: new DeviceSession(),
    recordingController: this._recordingController,
  });
}
```

So the platform `if/else` exists here.

It does not need to exist later in normal action execution because by then the `Device` already holds the correct runtime instance.

### Decision 2: CLI or gRPC for a capability?

This is decided inside the platform runtime class.

That means:

- `AndroidDevice` decides Android transport choices
- `IOSSimulator` decides iOS transport choices

`Device` does not decide transport. It only forwards the request to the runtime.

### What `Device.executeAction(...)` Does

`Device.executeAction(...)` should only map action type to a runtime capability.

Example:

```ts
async executeAction(request: DeviceActionRequest): Promise<DeviceNodeResponse> {
  const action = request.action;

  switch (action.type) {
    case StepAction.SCROLL_ABS:
      return await this._runtime.scrollAbs(action);

    case StepAction.DEEPLINK:
      return await this._runtime.openDeepLink(action.deeplink);

    case StepAction.GET_APP_LIST:
      return await this._runtime.getInstalledApps();

    case StepAction.GET_SCREENSHOT_AND_HIERARCHY:
      return await this._runtime.captureState(request.traceStep);

    default:
      return await this._commonDriverActions.execute(action);
  }
}
```

So `Device.executeAction(...)` chooses capability method names, not platform transport.

### Where Android Decides `adb` vs gRPC

Inside `AndroidDevice`.

Example:

```ts
class AndroidDevice implements DeviceRuntime {
  async scrollAbs(action: ScrollAbsAction): Promise<DeviceNodeResponse> {
    return toDeviceNodeResponse(
      await this._adbClient.swipe(this._deviceInfo.id!, {
        startX: action.startX,
        startY: action.startY,
        endX: action.endX,
        endY: action.endY,
        durationMs: action.durationMs,
      }),
    );
  }

  async openDeepLink(url: string): Promise<DeviceNodeResponse> {
    return toDeviceNodeResponse(
      await this._adbClient.openDeepLink(this._deviceInfo.id!, url),
    );
  }

  async getInstalledApps(): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.getInstalledApps();
  }
}
```

So the Android transport decision is encoded by method implementation:

- scroll -> `AdbClient`
- deep link -> `AdbClient`
- app list -> driver gRPC helper

No extra runtime `if/else` is needed because the object itself is already Android.

### Where iOS Decides `simctl` vs gRPC

Inside `IOSSimulator`.

Example:

```ts
class IOSSimulator implements DeviceRuntime {
  async scrollAbs(action: ScrollAbsAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.swipe(action);
  }

  async openDeepLink(url: string): Promise<DeviceNodeResponse> {
    return toDeviceNodeResponse(
      await this._simctlClient.openUrl(this._deviceInfo.id!, url),
    );
  }

  async getInstalledApps(): Promise<DeviceNodeResponse> {
    return toDeviceNodeResponseFromApps(
      await this._simctlClient.listInstalledApps(this._deviceInfo.id!),
    );
  }
}
```

So the iOS transport decision is encoded by method implementation:

- scroll -> gRPC helper
- deep link -> `SimctlClient`
- app list -> `SimctlClient`

Again, no extra runtime `if/else` is needed because the object itself is already iOS simulator.

### Summary of the Exact Logic

```text
Platform decision:
  GrpcDriverSetup.setUp(deviceInfo)
    if deviceInfo.isAndroid
      create AndroidDevice
    else
      create IOSSimulator

Capability dispatch:
  Device.executeAction(action)
    switch action.type
      -> runtime.scrollAbs(...)
      -> runtime.openDeepLink(...)
      -> runtime.captureState(...)
      -> commonDriverActions.execute(...)

Transport choice:
  AndroidDevice / IOSSimulator method implementations
    decide adb vs simctl vs gRPC
```

That is the full answer to "who decides?"

- `GrpcDriverSetup` decides Android vs iOS once
- `Device` decides which capability method to call
- `AndroidDevice` or `IOSSimulator` decides which transport/tool that capability uses

## Example Runtime Flow

### Android Scroll

```text
HeadlessActionExecutor
  -> Agent.executeAction(SCROLL_ABS)
  -> Device.executeAction(...)
  -> AndroidDevice.scrollAbs(...)
  -> AdbClient.swipe(...)
```

### iOS Scroll

```text
HeadlessActionExecutor
  -> Agent.executeAction(SCROLL_ABS)
  -> Device.executeAction(...)
  -> IOSSimulator.scrollAbs(...)
  -> DriverRpcClient.swipe(...)
```

### Android Setup

```text
prepareGoalSession()
  -> DeviceDiscoveryService
  -> GrpcDriverSetup
     -> AndroidDeviceSetup
        -> AdbClient.installApk(driver)
        -> AdbClient.installApk(test-runner)
        -> AdbClient.forwardPort(...)
        -> Android instrumentation launch
        -> DriverRpcClient.connect(...)
        -> ScreenshotCaptureCoordinator.waitForReadiness(...)
  -> AndroidDevice
  -> Device
```

### iOS Setup

```text
prepareGoalSession()
  -> DeviceDiscoveryService
  -> GrpcDriverSetup
     -> IOSSimulatorSetup
        -> ensure extracted runner app exists
        -> SimctlClient.installApp(...)
        -> SimctlClient.terminateRunner(...)
        -> SimctlClient.launchRunner(...)
        -> DriverRpcClient.connect(...)
        -> ScreenshotCaptureCoordinator.waitForReadiness(...)
        -> SimctlClient.listInstalledApps(...)
        -> DriverRpcClient.updateAppIds(...)
  -> IOSSimulator
  -> Device
```

## Single Device Lifecycle Walkthrough

This is the intended end-to-end walkthrough for one device after the refactor.

### 1. Session Preparation Starts in CLI

`prepareGoalSession()` still does the high-level orchestration:

```text
goalRunner.prepareGoalSession()
  -> resolve file paths
  -> DeviceNode.init(filePathUtil)
  -> DeviceNode.detectDevices(...)
  -> choose one DeviceInfo
  -> DeviceNode.setUpDevice(deviceInfo)
```

### 2. Device Discovery Is Isolated

`DeviceNode.detectDevices(...)` delegates to `DeviceDiscoveryService`.

Responsibilities:

- Android discovery through `AdbClient`
- iOS simulator discovery through `SimctlClient`
- return `DeviceInfo[]`

At this stage nothing is installed and no gRPC connection exists yet.

### 3. Device Setup Is Coordinated by `GrpcDriverSetup`

`DeviceNode.setUpDevice(deviceInfo)` calls:

```text
GrpcDriverSetup.setUp(deviceInfo)
```

`GrpcDriverSetup` does three things:

1. creates shared setup dependencies such as `DriverRpcClient`
2. chooses `AndroidDeviceSetup` or `IOSSimulatorSetup`
3. asks the chosen setup class to prepare the platform runtime

It remains the single setup façade, which keeps the call path readable.

### 4. Platform Setup Produces a Prepared Runtime

If the device is Android:

```text
GrpcDriverSetup
  -> AndroidDeviceSetup.prepare(...)
     -> AdbClient.installApk(driver)
     -> AdbClient.installApk(test-runner)
     -> AdbClient.removePortForward(...)
     -> AdbClient.forwardPort(...)
     -> AdbClient.startInstrumentationDriver(...)
     -> GrpcDriverSetup._connectWithPolling(...)
     -> ScreenshotCaptureCoordinator.waitForReadiness(...)
     -> return AndroidDevice
```

If the device is iOS simulator:

```text
GrpcDriverSetup
  -> IOSSimulatorSetup.prepare(...)
     -> ensure iOS runner app exists
     -> SimctlClient.installApp(...)
     -> SimctlClient.terminateApp(...)
     -> SimctlClient.launchRunner(...)
     -> GrpcDriverSetup._connectWithPolling(...)
     -> ScreenshotCaptureCoordinator.waitForReadiness(...)
     -> SimctlClient.listInstalledApps(...)
     -> DriverRpcClient.updateAppIds(...)
     -> return IOSSimulator
```

The important result is:

- setup classes return a prepared runtime object
- they do not return raw clients to the CLI

### 5. `Device` Is Created as the Runtime Wrapper

Once `GrpcDriverSetup` gets back `AndroidDevice` or `IOSSimulator`, it creates:

```text
new Device({
  deviceInfo,
  runtime,
  session,
  recordingController,
})
```

`Device` is the single object callers interact with.

Why this is useful:

- `DeviceNode` can pool one stable type
- `goalRunner` and `goal-executor` keep depending on `Agent`
- platform complexity stays below the `Device` layer

### 6. `DeviceNode` Stores and Returns the Prepared Device

```text
DeviceNode.setUpDevice(...)
  -> receives Device
  -> adds Device to DevicePool
  -> returns Device
```

So the outside world still sees:

- `DeviceNode.detectDevices()`
- `DeviceNode.setUpDevice()`
- `Device`

That external shape stays familiar.

### 7. Runtime Interaction Goes Through `Device`

During execution:

```text
HeadlessActionExecutor
  -> agent.executeAction(request)
  -> Device.executeAction(request)
```

`Device.executeAction(...)` should still decode `StepAction`, but it should no longer contain platform branching like:

- if Android do host-side thing
- else do gRPC thing

Instead it delegates to the runtime:

```text
Device.executeAction(SCROLL_ABS)
  -> runtime.scrollAbs(...)

Device.executeAction(DEEPLINK)
  -> runtime.openDeepLink(...)

Device.executeAction(GET_APP_LIST)
  -> runtime.getInstalledApps(...)

Device.executeAction(GET_SCREENSHOT_AND_HIERARCHY)
  -> runtime.captureState(...)
```

Then:

- `AndroidDevice` decides when to use `AdbClient`
- `IOSSimulator` decides when to use `SimctlClient`
- both can reuse `CommonDriverActions` for shared gRPC actions

### 8. Cleanup Also Goes Through `Device`

When the session ends:

```text
DeviceNode.cleanup()
  -> Device.closeConnection()
  -> runtime.close()
```

Android cleanup should include:

- recording cleanup
- driver-side `stopExecution()` behavior should remain aligned with current behavior in this refactor
- adb port-forward removal
- gRPC close

iOS cleanup should include:

- recording cleanup
- simulator runner termination if needed
- gRPC close

That makes setup and teardown symmetrical for one prepared device.

## File-Level Move Map

The refactor should be understandable as a concrete move plan.

### From `DeviceManager`

Move Android host-tooling code into `AdbClient`:

- `forwardPort(...)`
- `removePortForward(...)`
- `installAndroidApp(...)`
- `uninstallAndroidApp(...)`
- `openAndroidDeepLink(...)`
- `performAndroidSwipe(...)`

Move iOS simulator tooling into `SimctlClient`:

- `installIOSApp(...)`
- `openIOSDeepLink(...)`
- `terminateIOSApp(...)`
- `getIOSInstalledApps(...)`
- `getIOSInstalledAppIds(...)`
- `startIOSDriver(...)`

Move discovery code into `DeviceDiscoveryService` or keep it as the only remaining responsibility of a much smaller `DeviceManager`:

- `getAndroidDevices(...)`
- `getIOSDevices(...)`
- `_parseRuntimeVersion(...)`

Delete `DeviceManager` after migration:

- once discovery is moved and host-tooling is extracted, the class should disappear

### From `GrpcDriverSetup`

Move Android-specific setup flow into `AndroidDeviceSetup`:

- `_setupAndroid(...)`
- Android-only setup helpers and readiness logic that belong to Android startup

Move iOS-specific setup flow into `IOSSimulatorSetup`:

- `_setupIOS(...)`
- `_updateIOSAppIds(...)`
- iOS process-tracking helpers that belong to simulator startup

Keep in `GrpcDriverSetup`:

- public `setUp(...)` entrypoint
- platform selection
- shared orchestration that is genuinely common
- `_connectWithPolling(...)`
- `_delay(...)`

### From `Device`

Keep in `Device`:

- `Agent` implementation
- `DeviceInfo`
- `DeviceSession`
- `executeAction(...)` request routing
- lifecycle methods such as `setUp()`, `closeConnection()`, `getDeviceInfo()`, `getId()`

Move Android-specific runtime behavior into `AndroidDevice`:

- Android scroll routing
- Android deeplink execution
- Android installed-app lookup if it remains platform-specific there
- Android-specific cleanup

Move iOS-specific runtime behavior into `IOSSimulator`:

- iOS deeplink execution
- iOS installed-app enumeration
- iOS pre-launch app-id refresh
- iOS-specific cleanup

Move common gRPC-backed actions into a shared helper such as `CommonDriverActions` or a small `BaseDevice`:

- tap
- long press
- text entry
- back
- home
- hide keyboard
- press key
- launch app request marshalling
- kill app
- foreground check
- set location

Keep screenshot capture separate:

- `ScreenshotCaptureHelper` can become `ScreenshotCaptureCoordinator`
- both `AndroidDevice` and `IOSSimulator` use it through a narrow shared contract

Delete from `Device` after migration:

- platform-specific callback fields
- most `isAndroid` branching
- mixed Android/iOS special cases

### New Files to Create

- `packages/device-node/src/discovery/DeviceDiscoveryService.ts`
- `packages/device-node/src/infra/android/AdbClient.ts`
- `packages/device-node/src/infra/ios/SimctlClient.ts`
- `packages/device-node/src/grpc/setup/AndroidDeviceSetup.ts`
- `packages/device-node/src/grpc/setup/IOSSimulatorSetup.ts`
- `packages/device-node/src/device/shared/DeviceRuntime.ts`
- `packages/device-node/src/device/shared/CommonDriverActions.ts`
- `packages/device-node/src/device/android/AndroidDevice.ts`
- `packages/device-node/src/device/ios/IOSSimulator.ts`

### Existing Files Likely to Stay but Shrink

- `packages/device-node/src/DeviceNode.ts`
- `packages/device-node/src/grpc/GrpcDriverSetup.ts`
- `packages/device-node/src/device/RecordingManager.ts`
- `packages/device-node/src/device/AndroidRecordingProvider.ts`
- `packages/device-node/src/device/IOSRecordingProvider.ts`

## Cleanup Model

Cleanup should be explicit at the backend/bootstrap level instead of incidental.

Recommended responsibilities:

- Android backend cleanup:
  - stop recording if active
  - optionally call driver stop execution if useful
  - remove port forward
  - close gRPC client

- iOS backend cleanup:
  - stop recording if active
  - terminate simulator runner if needed
  - close gRPC client

This gives the repo a real device-session lifecycle instead of a mostly setup-oriented lifecycle.

## Migration Strategy

Do this incrementally.

### Phase 1

- extract `AdbClient` and `SimctlClient` from `DeviceManager`
- move discovery into `DeviceDiscoveryService`
- keep existing behavior unchanged

### Phase 2

- keep `GrpcDriverSetup` as the public setup façade
- extract `AndroidDeviceSetup` and `IOSSimulatorSetup`
- keep current public `DeviceNode` entrypoints

### Phase 3

- create `AndroidDevice` and `IOSSimulator` behind a shared `DeviceRuntime` interface
- keep `Device` as the orchestrating `Agent` wrapper
- move platform decision-making out of `Device`
- move shared gRPC action code into `CommonDriverActions` or a small shared base/helper

### Phase 4

- make cleanup explicit and test it
- simplify names and delete obsolete callback plumbing

## Testing Plan

Add or update tests for:

- Android discovery via `AdbClient` or discovery service
- iOS simulator discovery via `SimctlClient` or discovery service
- Android bootstrap happy path and failure paths
- iOS bootstrap happy path and failure paths
- Android backend routing for host-side actions
- iOS backend routing for simulator-side actions
- `Device` remaining a thin `Agent` adapter
- teardown behavior for Android and iOS sessions

## Rejected Alternatives

### 1. Keep the current structure and add more callbacks

Rejected because it scales poorly. Every new platform-specific action adds more setup-time wiring and more hidden behavior.

### 2. Organize the device layer strictly by transport

Rejected as the main structure because readers care about use cases first, not whether an operation happens through gRPC or a host shell.

### 3. Force everything through gRPC

Rejected for the first refactor because the current platform reality is already mixed, and the repo does not own all driver-side implementations.

## Open Questions

Resolved for this change:

- `CommonDriverActions` should be a helper object, not an abstract base
- Android app-list retrieval should remain driver-RPC-based
- iOS app-list retrieval should use `simctl`
- driver-side `stopExecution()` cleanup should follow current behavior for this refactor

There are no blocking open questions for the proposal at this point.

## Recommendation

The best refactor is:

- capability-oriented public API
- `Device` remains the stable orchestration wrapper
- explicit runtime classes: `AndroidDevice` and `IOSSimulator`
- thin host-tool adapters
- `GrpcDriverSetup` kept as a façade over `AndroidDeviceSetup` and `IOSSimulatorSetup`
- explicit cleanup as part of the new lifecycle

That keeps the important distinction, which is Android vs iOS behavior, while hiding the lower-level distinction of `grpc` vs `adb` vs `xcrun` behind the right boundary.
