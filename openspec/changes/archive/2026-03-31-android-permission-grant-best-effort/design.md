## Context

`AdbClient.allowAllPermissions` builds a map from `ANDROID_PERMISSION_TRANSLATIONS` and calls `togglePermissions`, which runs `adb shell pm grant <package> <android.permission.*>` for each entry. Node’s `execFile` rejects on non-zero exit; `_runAdb` catches, logs with `Logger.e`, and returns `success: false`. `togglePermissions` aggregates any failure and returns `success: false` for the whole batch. `AndroidDevice.launchApp` returns early when `allowAllPermissions` yields failure, so **`launchApp` never reaches the driver** even though many failures are Android’s “permission not in manifest” case.

The headless executor defaults `allowAllPermissions` to `true` (`HeadlessActionExecutor`), and `LaunchAppAction` / `TestStep` also default it to `true`. The user wants that default preserved.

## Goals / Non-Goals

**Goals:**

- When `pm grant` fails because the **target package has not declared** the permission, treat that outcome as **non-fatal** for `allowAllPermissions` / `togglePermissions` (and thus allow launch to continue).
- Log those cases at **info** (not error). Prefer reducing volume: e.g. one summary line plus optional debug per permission.
- Keep **`allowAllPermissions` default `true`** unchanged in model and executor.

**Non-Goals:**

- Parsing the app manifest ahead of time to shrink the grant list (possible future optimization).
- Changing iOS simulator permission flows (`SimctlClient.allowAllPermissions`).
- Changing which permissions appear in `ANDROID_PERMISSION_TRANSLATIONS`.
- Introducing a new user-facing CLI flag in this change (unless tasks discover a trivial need).

## Decisions

1. **Classification of stderr**  
   Detect the stable Android message substring (e.g. `has not requested permission` / `Package … has not requested permission`) in grant failure stderr and classify as **skip**. Other grant failures remain **failure** (error log, contribute to batch failure unless we later broaden “benign” cases).

2. **Where to branch**  
   Implement in `AdbClient` so both `allowAllPermissions` and explicit `togglePermissions` benefit: when `_runAdb` fails for `pm grant` / `pm revoke`, inspect captured stderr; if skip-classified, return `success: true` (or a dedicated result shape) and log at **info** with a short message. Simpler approach: extend `_runAdb` with an optional predicate/callback for “treat as success” **or** handle in `togglePermissions` only for grant/revoke args—**prefer handling in `togglePermissions`** after `_runAdb` failure by re-invoking logic without duplicating exec: parse error from `_toFailureResult` / catch path.  
   Cleanest: add a private helper `_runPmPermission` that runs adb, on catch checks stderr for skip pattern, logs `Logger.i`, returns `{ success: true, skipped: true }` for skip; otherwise `Logger.e` and failure. `togglePermissions` uses it for non-`SYSTEM_ALERT_WINDOW` paths.

3. **Batch `success` flag**  
   Skips do **not** push to `errors[]` in `togglePermissions`, so `allowAllPermissions` returns `success: true` if every grant either succeeded or was skipped; **any real failure** still fails the batch.

4. **Logging volume**  
   After implementation, if per-permission info is still too chatty, add one **info** summary at end of `allowAllPermissions` (e.g. “Granted N, skipped K undeclared for `<package>`”) and use **debug** for each skip—**design defers** to implementer: user asked for info instead of error; start with **info per skip** or **single summary**; tasks can specify “prefer single summary + debug detail”.

5. **Default `allowAllPermissions`**  
   No code change to defaults in `TestStep`, `LaunchAppAction`, `HeadlessActionExecutor` unless a file accidentally diverges—**verify** in tasks only.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| String matching breaks on localized or future Android messages | Match multiple substrings; unit tests with sample stderr; fallback remains “failure” if pattern unknown. |
| Typo in package name yields many “skip”-like messages | Unlikely same message; if ambiguous, treat as failure. |
| Hiding real security misconfiguration | Document best-effort semantics; optional future “strict” mode out of scope. |

## Migration Plan

- Ship in a normal release; no data migration. Rollback: revert `AdbClient` behavior.

## Open Questions

- Whether to log **one summary** vs **per-permission info** (product preference: user said “log as info”—summary is friendlier at scale).
