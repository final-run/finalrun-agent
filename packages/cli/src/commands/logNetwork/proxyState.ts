// Persists proxy state to disk so we can recover from crashes.
// If the process is SIGKILL'd, the next run detects the stale state
// and restores the original proxy settings before proceeding.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as net from 'node:net';

const STATE_DIR = path.join(os.homedir(), '.finalrun');
const STATE_FILE = path.join(STATE_DIR, 'proxy-state.json');

export interface SavedProxyState {
  platform: 'android' | 'ios';
  pid: number;
  ppid: number;
  proxyPort: number;
  startedAt: string;

  // Android-specific
  deviceSerial?: string;
  previousAndroidProxy?: string | null;

  // iOS-specific
  networkService?: string;
  previousAutoproxy?: { enabled: boolean; url: string };
}

export async function saveProxyState(state: SavedProxyState): Promise<void> {
  await fsp.mkdir(STATE_DIR, { recursive: true });
  await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export async function clearProxyState(): Promise<void> {
  try {
    await fsp.unlink(STATE_FILE);
  } catch {
    // File might not exist.
  }
}

export async function loadProxyState(): Promise<SavedProxyState | null> {
  try {
    const raw = await fsp.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as SavedProxyState;
  } catch {
    return null;
  }
}

/**
 * Check if the process that wrote the state file is still running.
 * Also checks the parent PID since tsx runs Node as a child.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any process in the given PID list is alive.
 */
export function isAnyProcessAlive(pids: number[]): boolean {
  return pids.some((pid) => isProcessAlive(pid));
}

/**
 * Check if anything is listening on a given localhost port.
 */
export async function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}
