# cli

The `packages/cli` package is the main CLI entry point. It orchestrates test runs, manages report writing, and generates HTML reports.

## Memory Files

| File | Description |
|------|-------------|
| [report-writer.md](report-writer.md) | ReportWriter artifact handling including device log copy and redaction |
| [multi-device-workspace.md](multi-device-workspace.md) | Multi-device test workspace layout, `devices.yaml` schema, token syntax, and CLI entry points |
| [multi-device-orchestration.md](multi-device-orchestration.md) | Multi-device test compilation, session runner, and router routing rules |

## Cross-Package Cross-References

Multi-device orchestration spans four packages; each owns a slice of the pipeline:

| Concern | Package | Memory |
|---------|---------|--------|
| Workspace + CLI entry + compile + session | `packages/cli` | [multi-device-workspace.md](multi-device-workspace.md), [multi-device-orchestration.md](multi-device-orchestration.md) |
| Orchestrator loop + planner sibling API + prompt | `packages/goal-executor` | [goal-executor/multi-device-planner.md](../goal-executor/multi-device-planner.md) |
| Shared data models (`MultiDeviceConfig`, `PerDeviceArtifact`, optional fields) | `packages/common` | [common/multi-device-models.md](../common/multi-device-models.md) |
| Per-device recording key scoping | `packages/device-node` | [device-node/recording-manager.md](../device-node/recording-manager.md) |
| Sandwich report UI | `packages/report-web` | [report-web/renderers.md](../report-web/renderers.md) |
