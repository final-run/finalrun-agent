// Platform-specific proxy configuration for network capture.
// Configures the device/simulator to route traffic through our proxy,
// verifies the CA cert is trusted, and restores settings on cleanup.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import { Logger } from '@finalrun/common';

const execFileAsync = promisify(execFile);

// ── Interface ────────────────────────────────────────────────────────────────

export interface NetworkProxySetup {
  /** Configure the device/host to route traffic through the proxy. */
  configureProxy(proxyPort: number): Promise<void>;
  /** Restore original proxy settings. */
  restoreProxy(): Promise<void>;
  /** Test if the CA cert is trusted by making a request through the proxy. */
  verifyCATrusted(proxyPort: number, caCert: string): Promise<boolean>;
}

// ── Android ──────────────────────────────────────────────────────────────────

const ANDROID_REVERSE_PORT = 8899;

export class AndroidNetworkProxySetup implements NetworkProxySetup {
  private _previousProxy: string | null = null;
  private _reverseActive = false;

  constructor(
    private readonly _adbPath: string,
    private readonly _deviceSerial: string,
  ) {}

  get isEmulator(): boolean {
    return this._deviceSerial.startsWith('emulator-');
  }

  async configureProxy(proxyPort: number): Promise<void> {
    // Save previous proxy.
    this._previousProxy = await this._getGlobalProxy();

    // Push CA cert to device.
    const caDir = path.join(process.env['HOME'] ?? '/tmp', '.finalrun', 'ca');
    const certDerPath = path.join(caDir, 'root.crt');
    if (fs.existsSync(certDerPath)) {
      await this._adb('push', certDerPath, '/sdcard/Download/finalrun-ca.crt');
    }

    // Set proxy target.
    let proxyTarget: string;
    if (this.isEmulator) {
      proxyTarget = `10.0.2.2:${proxyPort}`;
    } else {
      // Physical device: reverse tunnel.
      await this._adb('reverse', `tcp:${ANDROID_REVERSE_PORT}`, `tcp:${proxyPort}`);
      this._reverseActive = true;
      proxyTarget = `localhost:${ANDROID_REVERSE_PORT}`;
    }

    await this._setGlobalProxy(proxyTarget);
    Logger.d(`Android proxy set to ${proxyTarget}`);
  }

  async restoreProxy(): Promise<void> {
    try {
      if (this._previousProxy) {
        await this._setGlobalProxy(this._previousProxy);
      } else {
        await this._clearGlobalProxy();
      }
    } catch (error) {
      Logger.w('Failed to restore Android proxy', error);
    }

    if (this._reverseActive) {
      try {
        await this._adb('reverse', '--remove', `tcp:${ANDROID_REVERSE_PORT}`);
      } catch {
        // best effort
      }
      this._reverseActive = false;
    }
  }

  async verifyCATrusted(proxyPort: number, caCert: string): Promise<boolean> {
    return testProxyHttps(proxyPort, caCert);
  }

  private async _getGlobalProxy(): Promise<string | null> {
    const out = await this._shell('settings get global http_proxy');
    const trimmed = out.trim();
    return (!trimmed || trimmed === 'null') ? null : trimmed;
  }

  private async _setGlobalProxy(value: string): Promise<void> {
    await this._shell(`settings put global http_proxy ${value}`);
  }

  private async _clearGlobalProxy(): Promise<void> {
    await this._shell('settings put global http_proxy :0');
  }

  private async _shell(command: string): Promise<string> {
    const { stdout } = await execFileAsync(this._adbPath, ['-s', this._deviceSerial, 'shell', command]);
    return String(stdout).trimEnd();
  }

  private async _adb(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(this._adbPath, ['-s', this._deviceSerial, ...args]);
    return String(stdout).trimEnd();
  }
}

// ── iOS ──────────────────────────────────────────────────────────────────────

export class IOSNetworkProxySetup implements NetworkProxySetup {
  private _networkService: string | null = null;
  private _previousAutoproxy: { enabled: boolean; url: string } | null = null;
  private _pacServer: { url: string; stop: () => Promise<void> } | null = null;

  constructor(private readonly _simulatorUdid: string) {}

  async configureProxy(proxyPort: number): Promise<void> {
    // Install CA into simulator keychain.
    const caCertPath = path.join(process.env['HOME'] ?? '/tmp', '.finalrun', 'ca', 'root.pem');
    if (fs.existsSync(caCertPath)) {
      await this._xcrun('simctl', 'keychain', this._simulatorUdid, 'add-root-cert', caCertPath);
    }

    // Find active network service.
    this._networkService = await findActiveNetworkService();
    if (!this._networkService) {
      throw new Error('No active macOS network service found');
    }

    // Save previous autoproxy state.
    this._previousAutoproxy = await getAutoproxyUrl(this._networkService);

    // Start PAC server with DIRECT fallback (crash-safe).
    this._pacServer = await startPacServer(proxyPort);

    // Set autoproxy URL.
    await setAutoproxyUrl(this._networkService, this._pacServer.url);
    Logger.d(`iOS proxy set via PAC on ${this._networkService}: ${this._pacServer.url}`);
  }

  async restoreProxy(): Promise<void> {
    if (this._networkService && this._previousAutoproxy) {
      try {
        await restoreAutoproxy(this._networkService, this._previousAutoproxy);
      } catch (error) {
        Logger.w('Failed to restore macOS autoproxy', error);
      }
    }

    if (this._pacServer) {
      try {
        await this._pacServer.stop();
      } catch {
        // best effort
      }
      this._pacServer = null;
    }
  }

  async verifyCATrusted(proxyPort: number, caCert: string): Promise<boolean> {
    return testProxyHttps(proxyPort, caCert);
  }

  private async _xcrun(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('xcrun', args, { maxBuffer: 8 * 1024 * 1024 });
    return String(stdout).trim();
  }
}

// ── Shared: PAC server + networksetup helpers ────────────────────────────────

async function startPacServer(proxyPort: number): Promise<{ url: string; stop: () => Promise<void> }> {
  const pacContent = [
    'function FindProxyForURL(url, host) {',
    `    return "PROXY 127.0.0.1:${proxyPort}; DIRECT";`,
    '}',
  ].join('\n');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/proxy.pac' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/x-ns-proxy-autoconfig' });
        res.end(pacContent);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/proxy.pac`,
        stop: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 8 * 1024 * 1024 });
  return String(stdout).trim();
}

async function getAutoproxyUrl(service: string): Promise<{ enabled: boolean; url: string }> {
  const output = await run('networksetup', ['-getautoproxyurl', service]);
  return {
    enabled: /Enabled:\s*Yes/i.test(output),
    url: output.match(/URL:\s*(\S+)/)?.[1] ?? '',
  };
}

async function setAutoproxyUrl(service: string, pacUrl: string): Promise<void> {
  await run('networksetup', ['-setautoproxyurl', service, pacUrl]);
  await run('networksetup', ['-setautoproxystate', service, 'on']);
}

async function restoreAutoproxy(service: string, previous: { enabled: boolean; url: string }): Promise<void> {
  if (previous.enabled && previous.url) {
    await run('networksetup', ['-setautoproxyurl', service, previous.url]);
    await run('networksetup', ['-setautoproxystate', service, 'on']);
  } else {
    await run('networksetup', ['-setautoproxystate', service, 'off']);
  }
}

async function findActiveNetworkService(): Promise<string | null> {
  const output = await run('networksetup', ['-listallnetworkservices']);
  const services = output
    .split('\n')
    .filter((l) => !l.startsWith('*') && !l.startsWith('An asterisk'))
    .map((s) => s.trim())
    .filter(Boolean);

  for (const svc of services) {
    try {
      const info = await run('networksetup', ['-getinfo', svc]);
      if (info.includes('IP address') && !info.includes('IP address: none')) {
        return svc;
      }
    } catch {
      continue;
    }
  }
  return services[0] ?? null;
}

// ── Shared: connectivity test ────────────────────────────────────────────────

async function testProxyHttps(proxyPort: number, caCert: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'example.com',
        port: 443,
        path: '/',
        method: 'HEAD',
        agent: new https.Agent({
          host: '127.0.0.1',
          port: proxyPort,
          ca: caCert,
        } as https.AgentOptions),
        timeout: 5000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}
