# Recording Manager (device-node)

`RecordingManager` (`packages/device-node/src/device/RecordingManager.ts`) tracks active screen recordings per test. It was extended by change `260415-1mzp-multi-device-orchestration` to support parallel per-device recordings for the same `(runId, testId)` pair without breaking any single-device call site.

## Map-Key Scheme

Internal maps (`_recordingProcessMap`, `_recordingInfoMap`, etc.) are keyed by a string built by `getMapKey()`:

```typescript
getMapKey(runId: string, testId: string, deviceId?: string): string
```

| Args | Return | Used by |
|------|--------|---------|
| `getMapKey(runId, testId)` | `${runId}###${testId}` | All existing single-device call sites (byte-identical to pre-change) |
| `getMapKey(runId, testId, deviceId)` with non-empty `deviceId` | `${runId}###${testId}###${sanitizedDeviceId}` | Multi-device callers only |

`MAP_KEY_DELIMITER` is `###`. Device keys are sanitized defense-in-depth (the loader already rejects keys containing `###`).

## Opt-In Multi-Device Recording

`RecordingSessionStartParams` and `RecordingStopOptions` gained optional opt-in fields:

```typescript
interface RecordingSessionStartParams {
  deviceId: string;
  recordingRequest: RecordingRequest;
  platform: string;
  sdkVersion?: string;
  useDeviceScopedKey?: boolean;   // default false = byte-identical single-device behavior
}
interface RecordingStopOptions {
  platform: string;
  keepOutput?: boolean;
  deviceId?: string;              // omitted = legacy 2-part key; provided = 3-part key
}
```

Multi-device callers pass `useDeviceScopedKey: true` to `startRecording()` and `deviceId: <key>` to `stopRecording()`. Single-device callers continue to pass 2-arg `getMapKey()` calls and produce 2-part keys — unchanged on every byte.

## Parallel Recording

Multi-device orchestration wraps `Promise.all([startRecording(...alice), startRecording(...bob)])` at test start and `Promise.all([stopRecording(...alice), stopRecording(...bob)])` at teardown. Distinct map keys ensure no collision in any internal map.

## Design Decisions (from change 260415-1mzp)

- **Non-breaking optional 3rd arg** — alternative rejected: rename/resign the method signature. Every existing call site passes 2 args; a required 3rd arg would ripple across all single-device recording paths. The optional arg preserves byte-identical single-device behavior AND lets multi-device callers opt in explicitly.
- **Device-scoped key via opt-in flag** — `useDeviceScopedKey: boolean` on `startRecording` params (rather than auto-deriving from `deviceId` presence) makes the intent explicit at the call site. The flag and `deviceId` on stop options mirror each other.
- **Defense-in-depth sanitization** — loader enforcement is the primary guard against `###` in keys; `_sanitizeForFilename()` is the fallback in case an internal caller bypasses the loader.
