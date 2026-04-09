// iOS simulator helpers for the log-network command.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

export interface IOSSimulator {
  udid: string;
  name: string;
  state: string;
  runtime: string;
}

async function run(cmd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 8 * 1024 * 1024 });
  return String(stdout).trim();
}

export async function listBootedSimulators(): Promise<IOSSimulator[]> {
  const json = await run('xcrun', ['simctl', 'list', 'devices', 'booted', '-j']);
  const data = JSON.parse(json);
  const sims: IOSSimulator[] = [];
  for (const [runtime, devices] of Object.entries(data.devices as Record<string, Array<{ udid: string; name: string; state: string }>>)) {
    for (const d of devices) {
      if (d.state === 'Booted') {
        sims.push({ udid: d.udid, name: d.name, state: d.state, runtime });
      }
    }
  }
  return sims;
}

export async function installCACert(certPath: string, udid?: string): Promise<void> {
  const target = udid ?? 'booted';
  await run('xcrun', ['simctl', 'keychain', target, 'add-root-cert', certPath]);
}

export async function openApp(bundleId: string, udid?: string): Promise<void> {
  const target = udid ?? 'booted';
  await run('xcrun', ['simctl', 'launch', target, bundleId]);
}

export async function terminateApp(bundleId: string, udid?: string): Promise<void> {
  const target = udid ?? 'booted';
  try {
    await run('xcrun', ['simctl', 'terminate', target, bundleId]);
  } catch {
    // App might not be running.
  }
}

// ── PAC-based proxy (crash-safe: falls back to DIRECT if proxy dies) ────────

/**
 * Start a tiny HTTP server that serves a PAC file pointing to our proxy.
 * If the process dies, this server dies too → PAC URL becomes unreachable →
 * macOS can't fetch the PAC → falls back to direct connections. No broken internet.
 *
 * The PAC itself also has a DIRECT fallback: "PROXY ...; DIRECT" — double safety.
 */
export async function startPacServer(proxyPort: number): Promise<{ url: string; stop: () => Promise<void> }> {
  const pacContent = [
    'function FindProxyForURL(url, host) {',
    `    return "PROXY 127.0.0.1:${proxyPort}; DIRECT";`,
    '}',
  ].join('\n');

  const { createServer } = await import('node:http');

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
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
      const url = `http://127.0.0.1:${port}/proxy.pac`;
      resolve({
        url,
        stop: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

// ── macOS auto-proxy config (uses the PAC file) ─────────────────────────────

export interface AutoproxyState {
  enabled: boolean;
  url: string;
}

export async function getAutoproxyUrl(service: string): Promise<AutoproxyState> {
  const output = await run('networksetup', ['-getautoproxyurl', service]);
  const enabled = /Enabled:\s*Yes/i.test(output);
  const urlMatch = output.match(/URL:\s*(\S+)/);
  return {
    enabled,
    url: urlMatch?.[1] ?? '',
  };
}

export async function setAutoproxyUrl(service: string, pacUrl: string): Promise<void> {
  await run('networksetup', ['-setautoproxyurl', service, pacUrl]);
  await run('networksetup', ['-setautoproxystate', service, 'on']);
}

export async function restoreAutoproxy(service: string, previous: AutoproxyState): Promise<void> {
  if (previous.enabled && previous.url) {
    await run('networksetup', ['-setautoproxyurl', service, previous.url]);
    await run('networksetup', ['-setautoproxystate', service, 'on']);
  } else {
    await run('networksetup', ['-setautoproxystate', service, 'off']);
  }
}

export async function findActiveNetworkService(): Promise<string | null> {
  const output = await run('networksetup', ['-listallnetworkservices']);
  const services = output
    .split('\n')
    .filter((line) => !line.startsWith('*') && !line.startsWith('An asterisk'))
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
