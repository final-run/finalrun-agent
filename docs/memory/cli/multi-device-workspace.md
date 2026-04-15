# Multi-Device Workspace (v1: 2 Devices, Same Platform)

Multi-device tests exercise two devices running the same platform — for example, Alice's phone and Bob's phone in a chat scenario. v1 is Android-only; iOS multi-device lands in v2.

## Workspace Layout

A multi-device-enabled workspace lives under `.finalrun/multi-device/` alongside the single-device subtree:

```
.finalrun/
  tests/                       # single-device tests (existing)
  multi-device/
    devices.yaml               # exactly 2 entries; shared platform
    tests/
      chat/
        send_message.yaml      # test using ${devices.alice} / ${devices.bob}
    suites/
      chat-smoke.yaml          # optional suite aggregating multi-device tests
```

## `devices.yaml` Schema

Exactly 2 entries, both sharing a `platform`. v1 rejects any `platform` other than `android`.

```yaml
devices:
  alice:
    platform: android
    app: com.example.chat
  bob:
    platform: android
    app: com.example.chat
```

Keys (`alice`, `bob`) become the identifiers referenced by `${devices.<key>}` tokens inside tests.

## Token Syntax

Multi-device tests use three interpolation namespaces:

| Token                  | Evaluation                                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| `${variables.NAME}`    | Interpolated eagerly at compile time (same as single-device tests).        |
| `${devices.<key>}`     | Passed through literally to the planner; marks the active device for a step. |
| `${secrets.SECRET}`    | Passed through literally; redacted in logs/reports.                        |

Every step must reference at least one `${devices.<key>}` token. A step referencing both devices (`${devices.alice} ${devices.bob} observe message`) signals a parallel step — the planner emits up to 2 actions dispatched via `Promise.all`.

## CLI Entry Points

Multi-device selectors start with `multi-device/tests/`:

```bash
# Run a single multi-device test
finalrun test multi-device/tests/chat/send_message.yaml

# Run all multi-device tests
finalrun test multi-device/tests/

# Run a multi-device suite
finalrun test multi-device/suites/chat-smoke.yaml
```

Single-device selectors (`tests/...`) continue to route to the existing executor — multi-device and single-device selectors cannot be mixed in the same invocation.

## Report Layout

Runs with `multiDevice: true` render the sandwich workspace in the report UI:

```
┌─ alice video ─┐  ┌─ chat timeline ─┐  ┌─ bob video ─┐
│   9:19 ratio  │  │  step bubbles   │  │  9:19 ratio │
└───────────────┘  └─────────────────┘  └─────────────┘
┌──────────── synced scrubber (click to seek both) ────────────┐
```

Per-device artifacts live under `tests/{testId}/{alice,bob}/{actions,screenshots}/`. Step JSON is numbered by iteration (zero-padded 3 digits); parallel iterations yield one file per device at the same number.

## Fail-Fast Behavior

- Action failure on either device → whole test aborts (5-second cleanup ceiling).
- gRPC disconnect → whole test aborts; surviving recording stopped cleanly.
- Planner emits `>2` actions, duplicate-device actions, or unknown device key → retry once, then abort.
- Watchdog: same step pointer persists >5 iterations without progress → abort with reason `watchdog: step {N} stuck for >5 iterations`.
