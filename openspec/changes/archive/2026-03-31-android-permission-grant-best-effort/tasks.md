## 1. AdbClient: classify benign grant failures

- [x] 1.1 Add a small helper (e.g. `isUndeclaredPermissionGrantFailure(stderr: string): boolean`) that matches stable Android `pm grant` stderr for “package has not requested permission” (cover the exact English message from `PackageManagerService` / shell; add unit tests with representative stderr).
- [x] 1.2 For `pm grant` / `pm revoke` paths inside `togglePermissions`, when `_runAdb` fails, if the failure is classified as undeclared-permission skip, log with `Logger.i` (not `Logger.e`) and **do not** append to `errors` (treat as success for that permission). Prefer a single summary line for `allowAllPermissions` after the loop if per-permission info is too noisy; otherwise info per skip is acceptable.
- [x] 1.3 Ensure `SYSTEM_ALERT_WINDOW` / appops paths are unchanged unless the same benign pattern can appear there (scope: runtime `pm grant` only unless proven otherwise).

## 2. AndroidDevice and integration behavior

- [x] 2.1 Verify `AndroidDevice.launchApp` proceeds to `_commonDriverActions.launchApp` when `allowAllPermissions` completes with only skipped undeclared grants (batch `success: true`).
- [x] 2.2 Manually or via unit test: simulate mixed outcome—one real adb failure vs multiple skips—and confirm batch still fails only on real failures.

## 3. Tests

- [x] 3.1 Extend `AdbClient.test.ts`: mock `execFileFn` to reject with stderr matching undeclared message → expect no error log path / expect `togglePermissions` / `allowAllPermissions` overall success.
- [x] 3.2 Add negative test: stderr that does **not** match skip pattern → expect failure behavior unchanged (errors collected, `success: false` when appropriate).

## 4. Defaults verification (no functional change expected)

- [x] 4.1 Confirm `LaunchAppAction` / `TestStep` and `HeadlessActionExecutor` still default `allowAllPermissions` to `true`; document in a one-line comment near the new skip logic if helpful (optional).

## 5. Validation

- [x] 5.1 Run affected package tests (`packages/device-node`) and fix any regressions.
- [ ] 5.2 Smoke: `finalrun test` against an app with minimal manifest (e.g. Wikipedia dev) and confirm logs show info/summary instead of error spam and `launchApp` succeeds without wasted iterations. _(Not run in CI/sandbox; verify locally with Android emulator.)_
