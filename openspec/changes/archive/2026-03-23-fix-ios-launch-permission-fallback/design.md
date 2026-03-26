# Design

## Current State

### Current TypeScript behavior

iOS launch in [IOSSimulator.ts](/Users/ashishyadav/.codex/worktrees/a0b2/finalrun-ts/packages/device-node/src/device/ios/IOSSimulator.ts) now performs host-side prelaunch work before delegating to gRPC launch:

- terminate app if `stopAppBeforeLaunch`
- fail explicitly for `clearState`
- apply `allowAllPermissions` or `permissions` through [SimctlClient.ts](/Users/ashishyadav/.codex/worktrees/a0b2/finalrun-ts/packages/device-node/src/infra/ios/SimctlClient.ts)
- then call `CommonDriverActions.launchApp(...)`

The regression is in the permission step: [SimctlClient.ts](/Users/ashishyadav/.codex/worktrees/a0b2/finalrun-ts/packages/device-node/src/infra/ios/SimctlClient.ts) currently hard-fails whenever non-location permission work needs `applesimutils` and the binary is not installed.

### Maestro comparison

Maestro uses a looser fallback model in [SimctlIOSDevice.kt](/Users/ashishyadav/code/maestro/maestro-ios-driver/src/main/kotlin/device/SimctlIOSDevice.kt#L168):

- try `applesimutils`
- log failures instead of aborting
- still run a `simctl` permission pass

Maestro's current `simctl` implementation is narrow and mostly limited to location, but the important behavior is that missing `applesimutils` does not block launch.

### Apple first-party support

On this machine, `xcrun simctl help privacy` exposes first-party simulator permission control for:

- `all`
- `calendar`
- `contacts`
- `contacts-limited`
- `location`
- `location-always`
- `photos`
- `photos-add`
- `media-library`
- `microphone`
- `motion`
- `reminders`
- `siri`

That means `finalrun-ts` can do better than both the current strict failure and Maestro's location-only `simctl` path.

## Decisions

### 1. Keep the existing launch contract

Do not add new planner fields or launch-intent metadata.

`LaunchAppAction` keeps its current shape, including:

- `allowAllPermissions`
- `permissions`

This is a device-node behavior fix, not a contract redesign.

### 2. Make iOS permission preparation best-effort

iOS launch should continue even if some permissions cannot be pre-granted.

The runtime should:

- apply what Apple supports through `simctl privacy`
- try `applesimutils` for the remainder only if needed
- continue launch if `applesimutils` is missing
- log and surface which permissions were skipped

This keeps normal launch working while still taking advantage of automation when available.

### 3. Expand `simctl` coverage beyond location

[SimctlClient.ts](/Users/ashishyadav/.codex/worktrees/a0b2/finalrun-ts/packages/device-node/src/infra/ios/SimctlClient.ts) should stop treating `location` as the only first-party permission.

It should support current Apple `simctl privacy` services that map cleanly from the existing permission names:

- `calendar`
- `contacts`
- `location`
- `photos`
- `medialibrary` -> `media-library`
- `microphone`
- `motion`
- `reminders`
- `siri`

For `allowAllPermissions=true`, the client should use `simctl privacy grant all` for the supported subset, then optionally apply the unsupported remainder through `applesimutils`.

### 4. Unsupported permissions become warnings, not blockers

Based on the current local `simctl` toolchain, these existing TS permission names do not have a first-party `simctl privacy` path:

- `camera`
- `homeKit`
- `notifications`
- `speech`
- `userTracking`

If those are requested and `applesimutils` is unavailable:

- launch still proceeds
- the response/logs must clearly state that those permissions were not pre-granted
- tests that rely on those permissions will need to handle the system dialog in-flow

## Exact File Change Map

### iOS runtime / transport files

- `packages/device-node/src/infra/ios/SimctlClient.ts`
  - split requested permissions into `simctl`-supported and `applesimutils`-only groups
  - add helpers for `grant all` and per-service `grant/revoke/reset`
  - make `applesimutils` optional and return warning metadata instead of hard failure when it is missing
- `packages/device-node/src/device/ios/IOSSimulator.ts`
  - use the new best-effort permission helper during launch
  - continue launch when permission prep returns warnings instead of failures
  - append any skipped-permission warning to the launch response message or data

### Tests

- `packages/device-node/src/infra/ios/SimctlClient.test.ts`
  - cover permission splitting
  - cover `simctl` application for supported permissions
  - cover missing-`applesimutils` warning behavior for unsupported permissions
- `packages/device-node/src/device/ios/IOSSimulator.test.ts`
  - cover plain launch without `applesimutils`
  - cover `allowAllPermissions=true` continuing launch without `applesimutils`
  - cover supported custom permissions succeeding through `simctl`
  - cover unsupported custom permissions producing warnings but not failures

## Behavior Matrix

| Launch input | `simctl` work | `applesimutils` work | Launch behavior |
| --- | --- | --- | --- |
| `allowAllPermissions=true` | Grant Apple-supported subset | Try unsupported remainder | Continue even if `applesimutils` is missing |
| `allowAllPermissions=false`, no custom permissions | None | None | Continue |
| Custom permissions only in supported subset | Apply requested services | None | Continue |
| Custom permissions with unsupported services | Apply supported subset | Try unsupported remainder | Continue with warning if skipped |

## Testing Plan

Add or update tests for:

- missing-`applesimutils` launch fallback
- first-party `simctl privacy` routing for supported permissions
- warning metadata for skipped unsupported permissions
- no-regression behavior for plain launch, stop-before-launch, and clear-state failure

## Rejected Alternatives

### Add explicit implicit-versus-explicit permission intent

Rejected because it is a larger contract change than the current regression needs.

### Keep `applesimutils` as a hard requirement

Rejected because plain iOS launch should not fail on an optional third-party binary when Apple already provides partial first-party permission automation.

### Promise full permission automation without `applesimutils`

Rejected because current first-party `simctl` support does not cover every permission `finalrun-ts` models.
