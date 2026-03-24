# Tasks

- [x] Extend `packages/device-node/src/infra/ios/SimctlClient.ts` so iOS permission prep splits requests into Apple-supported `simctl privacy` permissions and optional `applesimutils` permissions.
- [x] Expand `SimctlClient` permission handling beyond location to the current Apple-supported simulator services and add a best-effort `grant all` path.
- [x] Rework `packages/device-node/src/device/ios/IOSSimulator.ts` so iOS `launch_app` continues when `applesimutils` is missing and surfaces skipped-permission warnings instead of failing the step.
- [x] Add regression tests in `packages/device-node` for:
  - plain launch without `applesimutils`
  - `allowAllPermissions=true` without `applesimutils`
  - supported custom permissions applied through `simctl`
  - unsupported permissions producing warnings but not launch failure
- [x] Run the relevant `packages/device-node` build/test suites and fix any regressions uncovered by the change.
