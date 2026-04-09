# Network Logging

FinalRun can capture every HTTP/HTTPS request your app makes during a test run — method, URL, status code, headers, request and response bodies, and timing. Traffic is recorded as [HAR 1.2](https://w3c.github.io/web-performance/specs/HAR/Overview.html) (the same format Chrome DevTools uses) and displayed in your test report with a searchable Network tab.

---

## How to enable

### Step 1: One-time device setup

Run the setup command for your platform:

```bash
# Android emulator or physical device
finalrun log-network --platform=android

# iOS simulator
finalrun log-network --platform=ios
```

The CLI walks you through each step:

1. Generates a FinalRun root CA certificate (cached at `~/.finalrun/ca/`, reused across runs)
2. Pushes the cert to the device
3. Guides you through installing it in the device's trust store

**Android additional step:** Your app's debug build must trust user-installed CAs. Add this to your app:

`AndroidManifest.xml`:
```xml
<application android:networkSecurityConfig="@xml/network_security_config">
```

`res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

This only affects debug builds — release builds are unaffected.

**iOS:** The CA is installed automatically into the simulator keychain. On some iOS versions, you may need to enable full trust once: Settings > General > About > Certificate Trust Settings > enable "FinalRun Local CA".

This setup only needs to happen **once per device/simulator**.

### Step 2: Enable in your workspace

Add to `.finalrun/config.yaml`:

```yaml
network:
  capture: true
```

### Step 3: Run your tests

```bash
finalrun test auth/login.yaml --platform android --model google/gemini-3-flash-preview
```

Network traffic is captured automatically for each test.

---

## What you get

### In the artifacts directory

Each test produces a `network.har` file:

```
artifacts/{runId}/tests/{testId}/
├── result.json
├── recording.mp4
├── device.log
├── network.har          ← new
├── actions/
└── screenshots/
```

### In the test report

A **Network** tab appears alongside the existing Recording, Device Logs, and Actions tabs:

- **Request table** — method, URL path, status code, duration, response size
- **Status filter chips** — All / 2xx / 3xx / 4xx / 5xx
- **Search** — filter by URL
- **Click a row** — detail panel slides in with three tabs:
  - **Headers** — all request and response headers
  - **Request Body** — formatted JSON or raw text (for POST/PUT requests)
  - **Response Body** — formatted JSON or raw text
- **Video sync** — click a request row and the recording seeks to that moment
- **Download** — link to the full `.har` file

### HAR import

The `.har` file can be opened in:
- Chrome DevTools (Network tab > Import HAR)
- Charles Proxy
- Proxyman
- Postman

---

## Standalone capture (without tests)

`finalrun log-network` also works as an interactive live capture tool:

```bash
finalrun log-network --platform=android
```

Every request streams to the terminal in real-time:

```
  GET     https://en.wikipedia.org/api/rest_v1/feed/featured/2026/04/07   200   111ms  31.8 KB
  POST    https://intake-analytics.wikimedia.org/v1/events                201   194ms      0 B
  GET     https://upload.wikimedia.org/wikipedia/commons/...              200   358ms  74.9 KB
```

Press Ctrl+C to stop — writes a `.har` file to the current directory. Useful for exploring what API calls your app makes or verifying that the CA setup is working before enabling capture in tests.

---

## What gets captured

| Field | Captured |
|---|---|
| HTTP method | Yes |
| Full URL (scheme, host, path, query) | Yes |
| All request headers | Yes |
| All response headers | Yes |
| Request body (text, up to 512 KB) | Yes |
| Response body (text, up to 512 KB) | Yes |
| Response status code and text | Yes |
| Response size | Yes |
| Request timing (start, duration) | Yes |
| Binary bodies (images, protobuf) | Size only, content skipped |
| WebSocket frames | Not yet |

---

## Automatic redaction

Sensitive data is redacted before the HAR is written to disk:

| What | Redacted to |
|---|---|
| `Authorization` header | `[REDACTED]` |
| `Cookie` / `Set-Cookie` headers | `[REDACTED]` |
| `X-API-Key` and any `X-*-Token` headers | `[REDACTED]` |
| Query params: `token`, `api_key`, `access_token`, `key`, `secret`, `password` | `[REDACTED]` |
| `${secrets.*}` values from your FinalRun environment bindings | `[REDACTED]` |

---

## SSL Certificate Pinning

Some apps hardcode the expected server certificate fingerprint. These apps will reject the FinalRun CA even when it's properly installed.

**In the report, you'll see:**

| Message | Meaning |
|---|---|
| `TLS rejected (app pins certificates)` | App compared cert fingerprints and rejected ours. This IS pinning. |
| `TLS closed (app may not trust user CAs)` | App doesn't have `<certificates src="user" />` in its network security config. |

**Which apps pin?**
- Google Play Services (`*.googleapis.com`, `*.google.com`) — always, expected
- Microsoft telemetry (`mobile.events.data.microsoft.com`) — always
- Banking / financial apps — commonly
- **Most apps (93%+) do NOT pin** — network capture will just work

**If your own app pins:** disable pinning in debug builds. The `<debug-overrides>` approach in `network_security_config.xml` handles this cleanly.

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| No Network tab in report | `network.capture` not set | Add `network: { capture: true }` to `.finalrun/config.yaml` |
| Network tab shows 0 requests | CA cert not installed on device | Run `finalrun log-network --platform=android` to set up |
| All traffic shows "TLS rejected" | App uses certificate pinning | Expected for system services. For your app: disable pinning in debug build |
| All traffic shows "TLS closed" | App doesn't trust user CAs | Add `<certificates src="user" />` to `network_security_config.xml` |
| Android device internet broken | Proxy left behind after crash | Run `adb shell settings put global http_proxy :0` |
| Mac internet issues after iOS capture | Should not happen (PAC fallback), but if so | Run `networksetup -setautoproxystate <service> off` |

---

## Platform comparison

| | Android | iOS Simulator |
|---|---|---|
| CA install | Manual via Settings UI (one-time) | Automatic via `simctl keychain` |
| App CA trust | Requires `network_security_config.xml` | Not required |
| Proxy method | `adb shell settings put global http_proxy` | PAC file via `networksetup` |
| Crash safety | Only device affected; auto-restored on next run | Mac internet survives crash (PAC DIRECT fallback) |
| Physical device | Supported via `adb reverse` tunnel | N/A (simulator only) |

---

## CLI reference

```
finalrun log-network --platform=<android|ios> [options]

Options:
  --platform <platform>  Target platform (required): android or ios
  --device <id>          Device serial (Android) or simulator name/UDID (iOS)
  --out <path>           Output HAR file path (default: auto-generated)
```

---

For technical internals (how the MITM proxy works, HAR format details, architecture, proxy state recovery), see [Network Capture Technical Reference](network-capture.md).
