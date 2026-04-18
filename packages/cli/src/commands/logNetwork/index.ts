// `finalrun log-network` — guided network capture for Android and iOS.
// Walks through setup steps, starts an HTTPS-intercepting proxy, streams
// captured traffic live, writes a HAR file on Ctrl+C.

import { promises as fsp } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import path from 'node:path';
import { colors as chalk } from './colors.js';
import { loadOrGenerateCA } from './ca.js';
import {
  resolveAdbPath,
  listDevices,
  push,
  getGlobalProxy,
  setGlobalProxy,
  clearGlobalProxy,
  reverse,
  removeReverse,
  isEmulator,
  getProp,
  type AdbDevice,
} from './adb.js';
import {
  listBootedSimulators,
  installCACert,
  findActiveNetworkService,
  startPacServer,
  getAutoproxyUrl,
  setAutoproxyUrl,
  restoreAutoproxy,
  type IOSSimulator,
} from './ios.js';
import { NetworkCapture, type CapturedEntry } from './capture.js';
import { printEntry, printTlsError } from './livePrinter.js';
import {
  saveProxyState,
  clearProxyState,
  loadProxyState,
  type SavedProxyState,
} from './proxyState.js';

export interface LogNetworkOptions {
  platform: string;
  device?: string;
  out?: string;
}

type TeardownFn = () => Promise<void>;

// ============================================================================
// Shared helpers
// ============================================================================

function createStepPrinter(stepTotal: number) {
  let step = 0;
  return (label: string, status: 'pass' | 'fail' | 'info', detail?: string) => {
    step++;
    const icon =
      status === 'pass' ? chalk.green('\u2713') : status === 'fail' ? chalk.red('\u2717') : chalk.blue('i');
    const suffix = detail ? `  ${chalk.dim(detail)}` : '';
    console.log(`  [${step}/${stepTotal}] ${label.padEnd(50)} ${icon}${suffix}`);
  };
}

async function runCleanup(teardownStack: Array<{ label: string; fn: TeardownFn }>): Promise<void> {
  console.log('\n  Cleaning up...');
  for (let i = teardownStack.length - 1; i >= 0; i--) {
    const { label, fn } = teardownStack[i]!;
    try {
      await fn();
      console.log(`    ${chalk.green('\u2713')} ${label}`);
    } catch (err) {
      console.log(`    ${chalk.red('\u2717')} ${label}: ${(err as Error).message}`);
    }
  }
  teardownStack.length = 0;
}

async function waitForCtrlC(): Promise<void> {
  await new Promise<void>((resolve) => {
    const onSignal = () => {
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
      resolve();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });
}

async function writeHarAndSummary(
  capture: NetworkCapture,
  tlsHostCauses: Map<string, string>,
  outPath: string | undefined,
): Promise<void> {
  const harPath = outPath ?? `finalrun-network-${timestamp()}.har`;
  const har = capture.toHar();
  await fsp.writeFile(harPath, JSON.stringify(har, null, 2), 'utf8');

  const decoded = capture.entries.length;
  const parts: string[] = [`${decoded} request(s) captured`];

  // Categorize TLS failures.
  let pinned = 0;
  let caRejected = 0;
  let otherTls = 0;
  for (const cause of tlsHostCauses.values()) {
    if (cause === 'cert-rejected') pinned++;
    else if (cause === 'closed' || cause === 'reset') caRejected++;
    else otherTls++;
  }
  if (pinned > 0) parts.push(`${pinned} host(s) pinned`);
  if (caRejected > 0) parts.push(`${caRejected} host(s) rejected CA`);
  if (otherTls > 0) parts.push(`${otherTls} host(s) TLS failed`);

  console.log(`\n  ${parts.join(', ')}.`);
  console.log(`  Wrote ${chalk.bold(path.resolve(harPath))}\n`);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

/**
 * Make a test HTTPS request through the proxy to verify the CA is trusted.
 * Returns true if the request succeeds (CA is working).
 */
/**
 * Check if a proxy is actually responding on a port (not just a stale socket).
 */
async function isProxyResponding(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: 'http://example.com/', method: 'HEAD', timeout: 2000 },
      (res) => { res.resume(); resolve(true); },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Make a test HTTPS request through the proxy to verify the CA is trusted.
 * Temporarily mutes the live printer so the test request doesn't appear.
 */
async function testProxyConnectivity(
  proxyPort: number,
  ca: { cert: string },
  capture: NetworkCapture,
): Promise<boolean> {
  const countBefore = capture.entries.length;
  const result = await new Promise<boolean>((resolve) => {
    const req = https.request(
      {
        hostname: 'example.com',
        port: 443,
        path: '/',
        method: 'HEAD',
        agent: new https.Agent({
          host: '127.0.0.1',
          port: proxyPort,
          ca: ca.cert,
        } as https.AgentOptions),
        timeout: 5000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
  // Remove the test request from captured entries so it doesn't pollute the HAR.
  if (capture.entries.length > countBefore) {
    (capture.entries as CapturedEntry[]).splice(countBefore);
  }
  return result;
}

// ============================================================================
// Stale proxy recovery
// ============================================================================

async function recoverStaleProxy(): Promise<void> {
  const state = await loadProxyState();
  if (!state) return;

  // Check if a live proxy is actually running on the saved port by making
  // a real HTTP request through it. A stale port (TIME_WAIT / lingering socket)
  // won't respond to an HTTP request.
  const proxyAlive = await isProxyResponding(state.proxyPort);
  if (proxyAlive) {
    return; // Another instance is actively running — leave it alone.
  }

  // The previous process is dead but left proxy settings behind.
  console.log(chalk.yellow(`\n  Recovering from a previous crashed session (PID ${state.pid}, started ${state.startedAt})...`));

  if (state.platform === 'android' && state.deviceSerial) {
    try {
      const adbPath = resolveAdbPath();
      if (adbPath) {
        if (state.previousAndroidProxy) {
          await setGlobalProxy(adbPath, state.deviceSerial, state.previousAndroidProxy);
        } else {
          await clearGlobalProxy(adbPath, state.deviceSerial);
        }
        console.log(chalk.green('    \u2713 restored Android proxy setting'));
      }
    } catch (err) {
      console.log(chalk.red(`    \u2717 failed to restore Android proxy: ${(err as Error).message}`));
    }
  }

  if (state.platform === 'ios' && state.networkService) {
    try {
      await restoreAutoproxy(
        state.networkService,
        state.previousAutoproxy ?? { enabled: false, url: '' },
      );
      console.log(chalk.green(`    \u2713 restored macOS proxy on "${state.networkService}"`));
    } catch (err) {
      console.log(chalk.red(`    \u2717 failed to restore macOS proxy: ${(err as Error).message}`));
    }
  }

  await clearProxyState();
  console.log('');
}

// ============================================================================
// Main entry
// ============================================================================

export async function runLogNetworkCommand(options: LogNetworkOptions): Promise<void> {
  const platform = options.platform.toLowerCase();
  if (platform !== 'android' && platform !== 'ios') {
    console.log(chalk.red('--platform must be "android" or "ios".'));
    process.exit(1);
  }

  // Recover from a previous crash before doing anything else.
  await recoverStaleProxy();

  const teardownStack: Array<{ label: string; fn: TeardownFn }> = [];

  try {
    if (platform === 'android') {
      await runAndroidCapture(options, teardownStack);
    } else {
      await runIOSCapture(options, teardownStack);
    }
  } catch (err) {
    console.log(`\n  ${chalk.red('Error:')} ${(err as Error).message}`);
    await runCleanup(teardownStack);
    await clearProxyState();
    process.exit(1);
  }
}

// ============================================================================
// Android capture flow
// ============================================================================

const PROXY_PORT_ON_DEVICE = 8899;

async function runAndroidCapture(
  options: LogNetworkOptions,
  teardownStack: Array<{ label: string; fn: TeardownFn }>,
): Promise<void> {
  const printStep = createStepPrinter(7);

  // ── Step 1: Host tools ────────────────────────────────────────────────
  const adbPath = resolveAdbPath();
  if (!adbPath) {
    printStep('Checking host tools (adb)', 'fail');
    console.log('        adb not found. Install the Android SDK platform-tools and add to PATH.');
    process.exit(1);
  }
  printStep('Checking host tools (adb)', 'pass');

  // ── Step 2: Detect device ─────────────────────────────────────────────
  const devices = (await listDevices(adbPath)).filter((d) => d.state === 'device');
  let device: AdbDevice;
  if (options.device) {
    const match = devices.find((d) => d.serial === options.device);
    if (!match) {
      printStep('Detecting device', 'fail');
      console.log(`        Device "${options.device}" not found. Available: ${devices.map((d) => d.serial).join(', ') || 'none'}`);
      process.exit(1);
    }
    device = match;
  } else if (devices.length === 1) {
    device = devices[0]!;
  } else if (devices.length === 0) {
    printStep('Detecting device', 'fail');
    console.log('        No Android devices/emulators connected. Start one and try again.');
    process.exit(1);
    return;
  } else {
    printStep('Detecting device', 'fail');
    console.log(`        Multiple devices found: ${devices.map((d) => d.serial).join(', ')}`);
    console.log('        Use --device <serial> to specify one.');
    process.exit(1);
    return;
  }
  const model = device.properties['model'] ?? device.serial;
  printStep('Detecting device', 'pass', `${device.serial} (${model})`);

  // ── Step 3: Generate/load CA cert ─────────────────────────────────────
  const ca = await loadOrGenerateCA();
  printStep(
    'Generating/loading FinalRun CA cert',
    'pass',
    ca.generated ? `created ${ca.files.certPath}` : ca.files.certPath,
  );

  // ── Step 4: Push CA cert to device ────────────────────────────────────
  const deviceCertDest = '/sdcard/Download/finalrun-ca.crt';
  await push(adbPath, device.serial, ca.files.certDerPath, deviceCertDest);
  printStep('CA cert pushed to device', 'pass', deviceCertDest);

  const apiLevel = parseInt(await getProp(adbPath, device.serial, 'ro.build.version.sdk'), 10);
  console.log('');
  console.log(chalk.yellow('  One-time setup (skip if already done):'));
  console.log(chalk.dim('  1. Install the CA cert on the device:'));
  if (apiLevel >= 33) {
    console.log(chalk.dim('     Settings > Security & privacy > More security settings'));
    console.log(chalk.dim('     > Encryption & credentials > Install a certificate > CA certificate'));
    console.log(chalk.dim(`     > Select "${deviceCertDest.split('/').pop()}"`));
  } else {
    console.log(chalk.dim('     Settings > Security > Encryption & credentials'));
    console.log(chalk.dim('     > Install a certificate > CA certificate'));
    console.log(chalk.dim(`     > Browse to Download/ and select "${deviceCertDest.split('/').pop()}"`));
  }
  if (apiLevel >= 24) {
    console.log(chalk.dim('  2. Your app must trust user CAs (debug builds). In res/xml/network_security_config.xml:'));
    console.log(chalk.dim('     <network-security-config><debug-overrides>'));
    console.log(chalk.dim('       <trust-anchors><certificates src="user" /></trust-anchors>'));
    console.log(chalk.dim('     </debug-overrides></network-security-config>'));
  }
  console.log('');

  // ── Step 5: Configure device proxy ────────────────────────────────────
  const capture = new NetworkCapture();
  const tlsHostCauses = new Map<string, string>();

  let muted = false;
  const proxyPort = await capture.start(ca.cert, ca.key, {
    onEntry: (entry) => { if (!muted) printEntry(entry); },
    onTlsError: (err) => {
      if (!muted && !tlsHostCauses.has(err.hostname)) {
        tlsHostCauses.set(err.hostname, err.failureCause ?? 'unknown');
        printTlsError(err);
      }
    },
  });

  teardownStack.push({
    label: 'stopped capture proxy',
    fn: () => capture.stop(),
  });

  const previousProxy = await getGlobalProxy(adbPath, device.serial);

  let proxyTarget: string;
  if (isEmulator(device.serial)) {
    proxyTarget = `10.0.2.2:${proxyPort}`;
  } else {
    await reverse(adbPath, device.serial, proxyPort, PROXY_PORT_ON_DEVICE);
    teardownStack.push({
      label: 'removed adb reverse forward',
      fn: () => removeReverse(adbPath, device.serial, PROXY_PORT_ON_DEVICE),
    });
    proxyTarget = `localhost:${PROXY_PORT_ON_DEVICE}`;
  }

  await setGlobalProxy(adbPath, device.serial, proxyTarget);
  teardownStack.push({
    label: 'restored device proxy setting',
    fn: async () => {
      if (previousProxy) {
        await setGlobalProxy(adbPath, device.serial, previousProxy);
      } else {
        await clearGlobalProxy(adbPath, device.serial);
      }
    },
  });

  // Persist proxy state for crash recovery.
  await saveProxyState({
    platform: 'android',
    pid: process.pid,
    ppid: process.ppid,
    proxyPort,
    startedAt: new Date().toISOString(),
    deviceSerial: device.serial,
    previousAndroidProxy: previousProxy,
  });

  printStep('Configuring device proxy', 'pass', proxyTarget);

  // ── Step 6: Verify HTTPS connectivity ─────────────────────────────────
  muted = true;
  const connected = await testProxyConnectivity(proxyPort, ca, capture);
  muted = false;
  if (connected) {
    printStep('Verifying HTTPS capture', 'pass', 'test request succeeded');
  } else {
    printStep('Verifying HTTPS capture', 'fail', 'CA cert not trusted on device');
    console.log('');
    console.log(chalk.red('  The device does not trust the FinalRun CA certificate.'));
    console.log(chalk.red('  HTTPS traffic will fail while the proxy is active.'));
    console.log('');
    console.log(chalk.yellow('  To fix: install the CA cert now (see step 4 instructions above),'));
    console.log(chalk.yellow('  then re-run this command.'));
    console.log('');
    await runCleanup(teardownStack);
    await clearProxyState();
    process.exit(1);
  }

  // ── Step 7: Start capture ─────────────────────────────────────────────
  printStep('Starting capture proxy', 'pass', `listening on 127.0.0.1:${proxyPort}`);

  console.log(
    `\n  ${chalk.green('Capturing.')} Press ${chalk.bold('Ctrl+C')} to stop.\n`,
  );

  await waitForCtrlC();
  await runCleanup(teardownStack);
  await clearProxyState();
  await writeHarAndSummary(capture, tlsHostCauses, options.out);
}

// ============================================================================
// iOS capture flow
// ============================================================================

async function runIOSCapture(
  options: LogNetworkOptions,
  teardownStack: Array<{ label: string; fn: TeardownFn }>,
): Promise<void> {
  const printStep = createStepPrinter(7);

  // ── Step 1: Host tools ────────────────────────────────────────────────
  printStep('Checking host tools (xcrun)', 'pass');

  // ── Step 2: Detect simulator ──────────────────────────────────────────
  const sims = await listBootedSimulators();
  let sim: IOSSimulator;
  if (options.device) {
    const match = sims.find((s) => s.udid === options.device || s.name === options.device);
    if (!match) {
      printStep('Detecting simulator', 'fail');
      console.log(`        Simulator "${options.device}" not found. Booted: ${sims.map((s) => `${s.name} (${s.udid})`).join(', ') || 'none'}`);
      process.exit(1);
    }
    sim = match;
  } else if (sims.length === 1) {
    sim = sims[0]!;
  } else if (sims.length === 0) {
    printStep('Detecting simulator', 'fail');
    console.log('        No booted iOS simulators found. Start one and try again.');
    process.exit(1);
    return;
  } else {
    printStep('Detecting simulator', 'fail');
    console.log(`        Multiple simulators booted: ${sims.map((s) => s.name).join(', ')}`);
    console.log('        Use --device <name-or-udid> to specify one.');
    process.exit(1);
    return;
  }
  printStep('Detecting simulator', 'pass', `${sim.name} (${sim.udid.slice(0, 8)}…)`);

  // ── Step 3: Generate/load CA cert ─────────────────────────────────────
  const ca = await loadOrGenerateCA();
  printStep(
    'Generating/loading FinalRun CA cert',
    'pass',
    ca.generated ? `created ${ca.files.certPath}` : ca.files.certPath,
  );

  // ── Step 4: Install CA cert in simulator keychain ─────────────────────
  await installCACert(ca.files.certPath, sim.udid);
  printStep('CA cert installed in simulator', 'pass', 'added to keychain as trusted root');

  console.log('');
  console.log(chalk.yellow('  One-time setup (skip if already done):'));
  console.log(chalk.dim('  On the simulator, enable full trust for the CA cert:'));
  console.log(chalk.dim('     Settings > General > About > Certificate Trust Settings'));
  console.log(chalk.dim('     > Enable "FinalRun Local CA"'));
  console.log('');

  // ── Step 5: Configure macOS proxy ─────────────────────────────────────
  const networkService = await findActiveNetworkService();
  if (!networkService) {
    printStep('Configuring macOS proxy', 'fail');
    console.log('        No active network service found.');
    process.exit(1);
    return;
  }

  const capture = new NetworkCapture();
  const tlsHostCauses = new Map<string, string>();

  let muted = false;
  const proxyPort = await capture.start(ca.cert, ca.key, {
    onEntry: (entry) => { if (!muted) printEntry(entry); },
    onTlsError: (err) => {
      if (!muted && !tlsHostCauses.has(err.hostname)) {
        tlsHostCauses.set(err.hostname, err.failureCause ?? 'unknown');
        printTlsError(err);
      }
    },
  });

  teardownStack.push({
    label: 'stopped capture proxy',
    fn: () => capture.stop(),
  });

  // Start a PAC server with DIRECT fallback — if our process crashes, the
  // PAC server dies too → macOS can't fetch the PAC → falls back to direct.
  // Double safety: the PAC itself also specifies "PROXY ...; DIRECT".
  const pacServer = await startPacServer(proxyPort);
  teardownStack.push({
    label: 'stopped PAC server',
    fn: () => pacServer.stop(),
  });

  const prevAutoproxy = await getAutoproxyUrl(networkService);

  await setAutoproxyUrl(networkService, pacServer.url);
  teardownStack.push({
    label: `restored macOS proxy on "${networkService}"`,
    fn: () => restoreAutoproxy(networkService, prevAutoproxy),
  });

  // Persist proxy state for crash recovery.
  await saveProxyState({
    platform: 'ios',
    pid: process.pid,
    ppid: process.ppid,
    proxyPort,
    startedAt: new Date().toISOString(),
    networkService,
    previousAutoproxy: prevAutoproxy,
  });

  printStep('Configuring macOS proxy', 'pass', `${networkService} → PAC with DIRECT fallback`);

  // ── Step 6: Verify HTTPS connectivity ─────────────────────────────────
  muted = true;
  const connected = await testProxyConnectivity(proxyPort, ca, capture);
  muted = false;
  if (connected) {
    printStep('Verifying HTTPS capture', 'pass', 'test request succeeded');
  } else {
    printStep('Verifying HTTPS capture', 'fail', 'CA cert not trusted');
    console.log('');
    console.log(chalk.red('  HTTPS verification failed. The CA cert may not be fully trusted.'));
    console.log(chalk.yellow('  On the simulator: Settings > General > About > Certificate Trust Settings'));
    console.log(chalk.yellow('  Enable the toggle for "FinalRun Local CA", then re-run.'));
    console.log('');
    await runCleanup(teardownStack);
    await clearProxyState();
    process.exit(1);
  }

  // ── Step 7: Start capture ─────────────────────────────────────────────
  printStep('Starting capture proxy', 'pass', `listening on 127.0.0.1:${proxyPort}`);

  console.log(
    `\n  ${chalk.green('Capturing.')} Press ${chalk.bold('Ctrl+C')} to stop.\n`,
  );
  console.log(chalk.dim('  Note: macOS proxy affects all Mac traffic while active. If the process crashes, traffic falls back to direct (no broken internet).\n'));

  await waitForCtrlC();
  await runCleanup(teardownStack);
  await clearProxyState();
  await writeHarAndSummary(capture, tlsHostCauses, options.out);
}
