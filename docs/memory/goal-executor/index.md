# goal-executor

The `packages/goal-executor` package owns the iteration loop and planner calls. `TestExecutor` runs single-device tests; `MultiDeviceOrchestrator` runs 2-device tests. Both compose the shared `AIAgent` (Vercel AI SDK wrapper) and `ActionExecutor`.

## Memory Files

| File | Description |
|------|-------------|
| [multi-device-planner.md](multi-device-planner.md) | `AIAgent.planMulti()` sibling API, `MultiDeviceOrchestrator` iteration loop, step pointer, fail-fast |
