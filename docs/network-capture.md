# Network Capture (`finalrun log-network`)

Capture and inspect HTTP/HTTPS traffic from Android emulators, physical Android devices, and iOS simulators — live in the terminal, exported as HAR.

```bash
# Android
finalrun log-network --platform=android

# iOS Simulator
finalrun log-network --platform=ios
```

---

## What happens when you run it

The command runs 7 steps. Here is exactly what each step does, for each platform.

### Step 1: Check host tools

| Platform | What it does |
|---|---|
| **Android** | Looks for `adb` — checks `$ANDROID_HOME/platform-tools/adb`, then falls back to `which adb`. If not found, exits with instructions. |
| **iOS** | Assumes `xcrun` is available (ships with Xcode). No check needed. |

### Step 2: Detect device

| Platform | What it does |
|---|---|
| **Android** | Runs `adb devices -l`, parses the output, filters to devices in `device` state. If one device: auto-selects it. If multiple: asks you to use `--device <serial>`. If none: exits. |
| **iOS** | Runs `xcrun simctl list devices booted -j`, parses the JSON. Same selection logic — one booted simulator auto-selects, multiple asks for `--device`. |

### Step 3: Generate or load the CA certificate

**This is the same for both platforms.**

Checks if `~/.finalrun/ca/` already exists with `root.pem` and `root.key`. If yes, loads them. If no, generates a new root CA using `mockttp.generateCACertificate()`:

- Algorithm: RSA 2048-bit
- Subject: `CN=FinalRun Local CA, O=FinalRun`
- Self-signed X.509 certificate

Three files are written to `~/.finalrun/ca/`:

| File | Format | Used by |
|---|---|---|
| `root.pem` | PEM-encoded certificate | mockttp (to sign leaf certs), iOS (`simctl keychain add-root-cert`) |
| `root.key` | PEM-encoded private key | mockttp (to sign leaf certs on the fly) |
| `root.crt` | DER-encoded certificate | Android (pushed to device — Android's cert installer expects DER) |

The DER file is created by stripping the PEM headers and base64-decoding to raw binary.

**These files are generated once and reused across all future runs.** Delete `~/.finalrun/ca/` to force regeneration.

### Step 4: Push / install the CA certificate

**Android:**

1. Runs `adb push ~/.finalrun/ca/root.crt /sdcard/Download/finalrun-ca.crt` — copies the DER cert file to the device's Downloads folder.
2. Prints instructions for manual installation (see [Android CA Setup](#android-ca-setup) below).
3. The push happens every run (idempotent). The manual install is one-time.

**iOS:**

1. Runs `xcrun simctl keychain <udid> add-root-cert ~/.finalrun/ca/root.pem` — installs the PEM cert directly into the simulator's keychain as a trusted root certificate.
2. This is fully automated — no manual step needed on most iOS versions.
3. On some older iOS versions, you may also need to enable full trust manually (see [iOS CA Setup](#ios-ca-setup) below).

### Step 5: Configure the proxy

This is where the platform approaches diverge significantly.

**Android (emulator):**

1. Starts the mockttp MITM proxy on `127.0.0.1:<random-port>`.
2. Reads the current proxy setting: `adb shell settings get global http_proxy`.
3. Sets the new proxy: `adb shell settings put global http_proxy 10.0.2.2:<port>`.
   - `10.0.2.2` is the Android emulator's special IP that routes to the host machine's `127.0.0.1`.
4. Registers a teardown action to restore the previous proxy value on exit.

**Android (physical device):**

1. Same as above, but instead of `10.0.2.2`, creates a reverse tunnel:
   - `adb reverse tcp:8899 tcp:<port>` — maps `localhost:8899` on the device to `127.0.0.1:<port>` on the host.
2. Sets proxy to `localhost:8899`.

**iOS (simulator):**

1. Starts the mockttp MITM proxy on `127.0.0.1:<random-port>`.
2. Starts a separate tiny HTTP server on another random port that serves a PAC (Proxy Auto-Config) file:
   ```javascript
   function FindProxyForURL(url, host) {
       return "PROXY 127.0.0.1:<proxy-port>; DIRECT";
   }
   ```
3. Reads the current autoproxy setting: `networksetup -getautoproxyurl <service>`.
4. Sets the PAC URL: `networksetup -setautoproxyurl <service> http://127.0.0.1:<pac-port>/proxy.pac`.
5. Registers teardown actions to restore the previous autoproxy setting and stop the PAC server.

**Why PAC instead of direct proxy for iOS:**

The iOS simulator is not a VM — it shares the Mac's network stack. Any proxy setting on the Mac affects **all** traffic on the Mac (browsers, other apps, everything). If we used `networksetup -setsecurewebproxy` and the process crashed, the Mac's proxy would be left pointing at a dead port and **all HTTPS on the Mac would break**.

The PAC approach has two layers of crash safety:
- **Layer 1:** The PAC file specifies `PROXY ...; DIRECT`. If the proxy is unreachable, the client falls back to `DIRECT` (no proxy).
- **Layer 2:** The PAC file is served by an HTTP server in our process. If our process dies, the PAC server dies too — macOS can't fetch the PAC at all and falls back to its default behavior.

**Tested:** We hard-killed the process with `kill -9` and confirmed the Mac's internet still works.

### Step 6: Verify HTTPS connectivity

**Same for both platforms.** The CLI makes a test `HEAD https://example.com` request through the proxy, using our CA cert for trust validation.

- **If it succeeds:** The CA is trusted, HTTPS interception is working. Proceeds to step 7.
- **If it fails:** The CA is not trusted on the device/simulator. The command immediately **restores all proxy settings** and exits with instructions on how to install the CA. Your device/Mac internet is not left broken.

This test request is muted (not shown in the live output) and excluded from the HAR file.

### Step 7: Start capturing

Prints `Capturing. Press Ctrl+C to stop.` and streams every intercepted request to stdout:

```
  03:11:17.688  GET     https://en.wikipedia.org/api/rest_v1/feed/configuration    200   66ms    842 B
  03:11:17.718  GET     https://en.wikipedia.org/api/rest_v1/feed/featured/...     200  111ms  31.8 KB
```

On Ctrl+C:
1. Teardown stack runs in reverse order (restore proxy → stop PAC server → stop mockttp).
2. Proxy state file (`~/.finalrun/proxy-state.json`) is deleted.
3. HAR file is written to disk.
4. Summary is printed with counts of captured requests and TLS failures.

---

## How the MITM proxy works

When the proxy is running and a device app makes a request to e.g. `https://en.wikipedia.org`:

```
1. App → sends CONNECT en.wikipedia.org:443 → our proxy
2. Proxy accepts the CONNECT tunnel
3. App starts TLS handshake inside the tunnel
4. Proxy generates a FAKE certificate for en.wikipedia.org on the fly,
   signed by our FinalRun root CA
5. App validates the cert chain:
   - Is en.wikipedia.org in the cert's subject? Yes (proxy generated it)
   - Is the issuer (FinalRun CA) trusted? Depends (see below)
6. If trusted: TLS handshake completes, proxy can read all traffic
7. Proxy opens a REAL TLS connection to en.wikipedia.org
8. Traffic flows: App ↔ Proxy (decrypted) ↔ Real Server (re-encrypted)
```

mockttp handles steps 2–7 automatically. The per-host leaf certificates are generated and cached in memory.

---

## Certificate trust: what must be true for HTTPS capture to work

For the app to accept our fake certificate, **two things** must be true:

### 1. The FinalRun CA must be installed on the device/simulator

| Platform | How it's installed | Automated? |
|---|---|---|
| **Android** | CLI pushes the DER file to `/sdcard/Download/`. User must manually install via Settings > Security > Install certificate. | **No** — manual step required. One-time per device. |
| **iOS** | CLI runs `xcrun simctl keychain add-root-cert`. Installed automatically. On some iOS versions, user must also enable trust in Settings. | **Mostly yes** — keychain install is automated. Trust toggle may need manual flip. |

### 2. The app must trust user-installed CAs (Android only)

Starting with Android 7 (API 24), apps **do not trust** user-installed CA certificates by default. The app must explicitly opt in via `network_security_config.xml`.

If the app doesn't have this config, you'll see:
```
  !!!  en.wikipedia.org  TLS closed (app may not trust user CAs)
```

This is **not certificate pinning** — it's the Android platform blocking user CAs. The fix is to add the config to the app's debug build.

iOS does not have this restriction. Once the CA is in the simulator keychain and trusted, all apps trust it.

---

<a id="android-ca-setup"></a>
## Android CA setup (one-time)

### Install the certificate

The CLI pushes the file automatically. You install it once via the device UI:

**Android 13+ (API 33+):**
1. Settings → Security & privacy → More security settings
2. Encryption & credentials → Install a certificate → CA certificate
3. Tap "Install anyway" on the warning
4. Select `finalrun-ca.crt` from the Download folder

**Android 7–12 (API 24–32):**
1. Settings → Security → Encryption & credentials
2. Install a certificate → CA certificate
3. Select `finalrun-ca.crt` from the Download folder

### Configure your app to trust user CAs

Add to your app's `AndroidManifest.xml`:
```xml
<application android:networkSecurityConfig="@xml/network_security_config">
```

Create `res/xml/network_security_config.xml`:
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

`<debug-overrides>` only applies when `android:debuggable="true"` — release builds are unaffected.

> **Note:** The Wikipedia Android app's debug build already includes this configuration.

---

<a id="ios-ca-setup"></a>
## iOS CA setup (mostly automatic)

### Certificate installation (automatic)

The CLI runs `xcrun simctl keychain booted add-root-cert` — no manual step.

### Certificate trust (may need manual toggle)

On some iOS versions, after the cert is installed, you must enable full trust:

1. On the simulator: Settings → General → About → Certificate Trust Settings
2. Enable the toggle for "FinalRun Local CA"

---

## SSL / Certificate Pinning

### What is pinning?

Some apps hardcode the expected server certificate fingerprint. Even if our CA is trusted by the OS, the app compares the cert's fingerprint against the hardcoded value. Our proxy-generated cert has a different fingerprint → the app rejects it.

### Does FinalRun bypass pinning?

**No.** Bypassing pinning requires runtime hooking (Frida/objection), which FinalRun does not integrate. Pinned hosts appear in the output but with **no request/response data** — only the hostname is visible.

### How FinalRun labels TLS failures

FinalRun reads the `failureCause` from mockttp's TLS error event and shows a specific message:

| CLI output | `failureCause` | What it means | What to do |
|---|---|---|---|
| `TLS rejected (app pins certificates)` | `cert-rejected` | The app explicitly compared cert fingerprints and rejected ours. This IS pinning. | If it's your app: disable pinning in debug builds. If it's a third-party app: nothing you can do. |
| `TLS closed (app may not trust user CAs)` | `closed` | The app closed the TLS connection. Most likely: Android app without `<certificates src="user" />` in its network security config. | Add the `network_security_config.xml` snippet to your app's debug build. |
| `TLS reset (app may not trust user CAs)` | `reset` | Same as above but the connection was forcefully reset. | Same fix. |
| `TLS failed` | `unknown` / other | Generic TLS failure (timeout, cipher mismatch, etc). | Check connectivity and retry. |

The summary at the end separates counts:
```
  11 request(s) captured, 4 host(s) pinned, 1 host(s) rejected CA.
```

### Which apps pin?

- **Google Play Services** (`*.googleapis.com`, `*.google.com`) — always. Expected, unavoidable.
- **Microsoft telemetry** (`mobile.events.data.microsoft.com`) — pins on both platforms.
- **Banking/financial apps** — commonly pin.
- **Most other apps** — do NOT pin. Research shows 1–7% of apps implement pinning.

### If you control the app

Disable pinning in debug builds. The `<debug-overrides>` approach in Android's Network Security Config handles this cleanly — put pinning only in your production config, not in `<debug-overrides>`.

---

## Crash safety

### Android

If the process crashes, the device proxy setting (`settings put global http_proxy`) is left pointing at a dead port. **Only the emulator/device is affected** — not your Mac.

On the next run, the CLI detects the stale `~/.finalrun/proxy-state.json`, confirms the proxy port is dead, and restores the previous proxy setting automatically:

```
  Recovering from a previous crashed session (PID 53043, started 2026-04-06T05:29:03.179Z)...
    ✓ restored Android proxy setting
```

**Manual recovery** (if you don't re-run the command):
```bash
adb shell settings put global http_proxy :0
```

### iOS

If the process crashes, the PAC autoproxy URL is left set on the Mac. But because:
1. The PAC server (in our process) is also dead → macOS can't fetch the PAC
2. The PAC content has `DIRECT` fallback → even if cached, traffic goes direct

**Your Mac internet continues to work.** Tested with `kill -9`.

On the next run, the CLI detects the stale state and restores the previous autoproxy setting.

**Manual recovery** (if needed):
```bash
networksetup -setautoproxystate <service> off
```

Find your service name: `networksetup -listallnetworkservices`.

---

## Troubleshooting

### Step 6 fails: "CA cert not trusted"

The CLI made a test HTTPS request through the proxy and it failed. The proxy settings are immediately restored — your device/Mac internet is not broken.

**Android fix:**
1. Install the CA cert on the device (see [Android CA Setup](#android-ca-setup))
2. Re-run the command

**iOS fix:**
1. On the simulator: Settings → General → About → Certificate Trust Settings → enable "FinalRun Local CA"
2. Re-run the command

### All traffic shows as TLS failures, zero requests captured

Your CA is installed, but the **app** doesn't trust user CAs. This is the Android `network_security_config` issue.

**How to tell:** The TLS message says `TLS closed (app may not trust user CAs)` — not `TLS rejected (app pins certificates)`.

**Fix:** Add `<certificates src="user" />` to your app's debug build (see [Android CA Setup](#android-ca-setup)).

### Multiple devices / simulators

Use `--device`:
```bash
# Android — serial from `adb devices`
finalrun log-network --platform=android --device emulator-5554

# iOS — name or UDID from `xcrun simctl list devices`
finalrun log-network --platform=ios --device "iPhone 16"
```

---

## CLI reference

```
finalrun log-network --platform=<android|ios> [options]

Options:
  --platform <platform>  Target platform (required): android or ios
  --device <id>          Device serial (Android) or simulator name/UDID (iOS).
                         Auto-detected if only one is connected.
  --out <path>           Output HAR file path. Default: finalrun-network-<timestamp>.har
```

### Output format

**HAR 1.2** (HTTP Archive). Import into Chrome DevTools (Network tab → Import HAR), Charles Proxy, Proxyman, or Postman.

Each entry includes: method, full URL, request headers, response status/headers, response size, timing.

---

## Architecture

```
packages/cli/src/commands/logNetwork/
├── index.ts          Main command: step runner, teardown stack, signal handling
├── capture.ts        mockttp wrapper: start/stop proxy, request/response correlation, HAR export
├── ca.ts             CA generation + caching at ~/.finalrun/ca/
├── adb.ts            Android: adb device listing, push, proxy settings, reverse tunnels
├── ios.ts            iOS: simctl keychain, PAC server, networksetup autoproxy config
├── livePrinter.ts    Formats each captured request as a colorized CLI line
└── proxyState.ts     Crash recovery: saves/loads proxy state to ~/.finalrun/proxy-state.json
```

---

## Known limitations

- **Request/response bodies** are not captured (size only in HAR)
- **Header redaction** (Authorization, Cookie, etc.) is not implemented — HAR contains raw headers
- **App filtering** is not available — all device traffic is captured, including system services
- **SSL pinning bypass** is not supported — pinned apps show as TLS failures with hostname only
- **macOS proxy is system-wide** (iOS) — all Mac traffic routes through the proxy while active (but crash-safe via PAC fallback)
- **Android CA install is manual** — cannot be automated without root access
