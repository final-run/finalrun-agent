# Multi-Device Data Models (common)

Shared types that flow through CLI → goal-executor → device-node → report-web for multi-device runs. Every multi-device field is **optional** and absent in single-device runs so emitted JSON remains byte-identical to the pre-change baseline. Introduced by change `260415-1mzp-multi-device-orchestration`.

## `MultiDeviceConfig`

`packages/common/src/models/MultiDeviceConfig.ts`:

```typescript
interface DeviceDefinition {
  platform: string;   // v1: must be 'android'
  app: string;        // packageName (Android) or bundleId (iOS, rejected in v1)
}
interface MultiDeviceConfig {
  devices: Record<string, DeviceDefinition>;   // exactly 2 keys, shared platform
}
```

Loader-enforced invariants are captured in [cli/multi-device-orchestration.md](../cli/multi-device-orchestration.md). The type is shared between loader and `prepareMultiDeviceTestSession()` without casts.

## Optional Fields on `AgentAction`

`packages/common/src/models/TestResult.ts`:

```typescript
interface AgentAction {
  // ... all existing fields unchanged ...
  device?: string;    // device key in multi-device runs; omitted in single-device
}
```

Single-device runs MUST omit `device` entirely (not serialize `undefined`) so the JSON diff is empty.

## `PerDeviceArtifact`

```typescript
interface PerDeviceArtifact {
  folder: string;               // e.g. 'alice'
  recordingFile?: string;       // mp4/mov path relative to run root
  deviceLogFile?: string;       // device log path relative to run root
  recordingStartedAt?: string;  // ISO timestamp, used for scrubber anchoring
}
```

## Optional Fields on `TestResult`

```typescript
interface TestResult {
  // ... existing fields ...
  multiDevice?: { devices: Record<string, PerDeviceArtifact> };
}
```

Present → `reportWriter.writeTestRecord()` branches into the per-device path. Absent → byte-identical single-device writer output.

## `RunManifest.multiDevice`

`packages/common/src/models/RunManifest.ts`:

```typescript
interface RunManifest {
  schemaVersion: 2 | 3;          // 3 is the current cursor; 2 still loads in report-web
  // ... existing fields ...
  multiDevice?: {
    devices: Record<string, { platform: string; app?: string; hardwareName: string }>;
  };
}
```

`hardwareName` records which physical/virtual device was auto-assigned to each logical key by `prepareMultiDeviceTestSession()`.

## Schema Version Policy

`schemaVersion` was bumped from `2` to `3` to accommodate multi-device fields. The type is `2 | 3` for backward compatibility — report-web's `artifacts.ts` accepts both. Single-device runs emit `schemaVersion: 3` but without any `multiDevice` or per-device fields, so the diff against a baseline v2 run is limited to the `schemaVersion` byte itself (the report-web loader accepts both values transparently).

## Design Decisions (from change 260415-1mzp)

- **Optional fields over new sibling types** at the top-level `TestResult` / `AgentAction` level (unlike the planner, which uses siblings) — these types cross many package boundaries; sibling types would force every consumer to branch. Optional fields keep the single-device path's type shape intact.
- **Map-key delimiter `###` reserved** — loader rejects device keys containing `###` so recording map keys never collide.
- **`schemaVersion: 2 | 3`** — union type rather than number; forces exhaustive handling in writers/readers and prevents accidental version regressions.
