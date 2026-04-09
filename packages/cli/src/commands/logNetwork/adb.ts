// Minimal adb wrapper for the log-network command. Self-contained so this
// feature can iterate without touching the shared AdbClient yet.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export interface AdbDevice {
  serial: string;
  state: string;
  properties: Record<string, string>;
}

export interface AdbResult {
  stdout: string;
  stderr: string;
}

export class AdbError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
  ) {
    super(message);
    this.name = 'AdbError';
  }
}

export function resolveAdbPath(): string | null {
  const home = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
  if (home) {
    const candidate = path.join(home, 'platform-tools', 'adb');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  // Fallback: hope it's on PATH.
  try {
    // We rely on execFile('adb', ...) working if PATH resolves it.
    // A richer resolve path can be added later.
    return 'adb';
  } catch {
    return null;
  }
}

async function run(adbPath: string, args: string[]): Promise<AdbResult> {
  try {
    const { stdout, stderr } = await execFileAsync(adbPath, args, {
      maxBuffer: 8 * 1024 * 1024,
    });
    return { stdout: String(stdout), stderr: String(stderr) };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    throw new AdbError(
      `adb ${args.join(' ')} failed: ${err.message}`,
      typeof err.stderr === 'string' ? err.stderr : undefined,
    );
  }
}

export async function listDevices(adbPath: string): Promise<AdbDevice[]> {
  const { stdout } = await run(adbPath, ['devices', '-l']);
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('List of devices'));

  const devices: AdbDevice[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const serial = parts[0];
    const state = parts[1];
    if (!serial || !state) continue;
    const properties: Record<string, string> = {};
    for (let i = 2; i < parts.length; i++) {
      const kv = parts[i];
      if (!kv) continue;
      const eq = kv.indexOf(':');
      if (eq > 0) {
        properties[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
    devices.push({ serial, state, properties });
  }
  return devices;
}

export async function shell(adbPath: string, serial: string, command: string): Promise<string> {
  const { stdout } = await run(adbPath, ['-s', serial, 'shell', command]);
  return stdout.trimEnd();
}

export async function push(
  adbPath: string,
  serial: string,
  src: string,
  dest: string,
): Promise<void> {
  await run(adbPath, ['-s', serial, 'push', src, dest]);
}

export async function reverse(
  adbPath: string,
  serial: string,
  hostPort: number,
  devicePort: number,
): Promise<void> {
  // tcp:devicePort on device -> tcp:hostPort on host (reverse tunnel).
  await run(adbPath, [
    '-s',
    serial,
    'reverse',
    `tcp:${devicePort}`,
    `tcp:${hostPort}`,
  ]);
}

export async function removeReverse(
  adbPath: string,
  serial: string,
  devicePort: number,
): Promise<void> {
  try {
    await run(adbPath, ['-s', serial, 'reverse', '--remove', `tcp:${devicePort}`]);
  } catch {
    // best effort
  }
}

export async function getGlobalProxy(adbPath: string, serial: string): Promise<string | null> {
  const out = await shell(adbPath, serial, 'settings get global http_proxy');
  const trimmed = out.trim();
  if (!trimmed || trimmed === 'null') return null;
  return trimmed;
}

export async function setGlobalProxy(
  adbPath: string,
  serial: string,
  hostPort: string,
): Promise<void> {
  await shell(adbPath, serial, `settings put global http_proxy ${hostPort}`);
}

export async function clearGlobalProxy(adbPath: string, serial: string): Promise<void> {
  // `:0` is the documented way to clear; `delete` also works on most images.
  await shell(adbPath, serial, 'settings put global http_proxy :0');
}

export async function getProp(adbPath: string, serial: string, key: string): Promise<string> {
  return await shell(adbPath, serial, `getprop ${key}`);
}

export function isEmulator(serial: string): boolean {
  return serial.startsWith('emulator-');
}
