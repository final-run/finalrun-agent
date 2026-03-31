## Why

FinalRun’s Android `launchApp` path with `allowAllPermissions: true` runs `adb shell pm grant` for a fixed set of runtime permission groups. Apps such as Wikipedia (`org.wikipedia.dev`) declare only a subset of those permissions in their manifest. Android correctly rejects grants for undeclared permissions with `SecurityException: Package … has not requested permission …`. Today those outcomes are treated like hard failures and logged at error level, which floods logs, can block `launchApp` from proceeding, and wastes goal-executor iterations even though the situation is expected and benign.

## What Changes

- Treat **“package has not requested this permission”** (and equivalent) as **skipped / not applicable**: do **not** fail the overall permission or launch step solely for those grants.
- Log those skips at **info** (or debug) level instead of **error**, optionally with a **single summary** per launch to avoid per-permission noise.
- Preserve **`allowAllPermissions` default `true`** in the product model and headless executor so behavior stays opt-out rather than opt-in.
- Optionally document that `allowAllPermissions` is **best-effort**: only permissions declared by the target app can be granted via `pm grant`.

## Capabilities

### New Capabilities

- `android-runtime-permissions`: Requirements for how FinalRun applies Android runtime permissions during app launch (`allowAllPermissions`, `pm grant`), including best-effort semantics, logging levels, and when launch must still succeed.

### Modified Capabilities

- _(none — existing `simplified-run-invocation` spec does not define Android permission behavior.)_

## Impact

- **`packages/device-node`**: `AdbClient.togglePermissions` / `allowAllPermissions` and possibly `_runAdb` handling for grant outcomes.
- **`packages/device-node`**: `AndroidDevice.launchApp` interaction with permission results (must not abort launch for benign skips).
- **Tests**: `AdbClient` / `AndroidDevice` unit tests for mixed grant outcomes.
- **Logging**: `@finalrun/common` `Logger` usage (info vs error) for the skip path.
- **No breaking change** to public TypeScript APIs; default `allowAllPermissions` remains `true` (`TestStep` / `LaunchAppAction` / executor defaults unchanged in intent).
