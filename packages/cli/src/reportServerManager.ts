import * as fsp from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import type { ReportServerState } from '@finalrun/common';
import type { FinalRunWorkspace } from '@finalrun/common';
import { resolveCliLaunchArgs, resolveFinalRunRootDir } from './runtimePaths.js';

const DEFAULT_REPORT_SERVER_PORT = 4173;
const HEALTH_ROUTE = '/health';
const DEFAULT_HEALTH_PROBE_TIMEOUT_MS = 2000;

interface ReportHealthPayload {
  status?: string;
  workspaceRoot?: string;
  artifactsDir?: string;
  pid?: number;
}

export interface StartReportServerOptions {
  workspace: FinalRunWorkspace;
  requestedPort?: number;
  dev?: boolean;
}

export interface ReportServerSession {
  state: ReportServerState;
  url: string;
  reused: boolean;
}

export interface WorkspaceReportServerStatus {
  running: boolean;
  healthy: boolean;
  staleStateCleared: boolean;
  livePid?: number;
  state?: ReportServerState;
}

export interface StopWorkspaceReportServerResult {
  stopped: boolean;
  staleStateCleared: boolean;
  state?: ReportServerState;
}

export const reportServerManagerDependencies = {
  healthProbeTimeoutMs: DEFAULT_HEALTH_PROBE_TIMEOUT_MS,
  spawnProcess(
    command: string,
    args: string[],
    options: {
      cwd: string;
      detached?: boolean;
      env?: NodeJS.ProcessEnv;
      stdio?: 'ignore';
    },
  ): ChildProcess {
    return spawn(command, args, options);
  },
  async fetchJson(
    url: string,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: unknown }> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
      signal,
    });
    let body: unknown = undefined;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return {
      status: response.status,
      body,
    };
  },
  async openBrowser(url: string): Promise<void> {
    if (process.env.FINALRUN_DISABLE_BROWSER === '1') {
      return;
    }
    const platform = process.platform;
    if (platform === 'darwin') {
      const result = spawnSync('open', [url], { stdio: 'ignore' });
      if (result.status !== 0) {
        throw new Error(`Failed to open browser for ${url}`);
      }
      return;
    }
    if (platform === 'win32') {
      const result = spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' });
      if (result.status !== 0) {
        throw new Error(`Failed to open browser for ${url}`);
      }
      return;
    }
    const result = spawnSync('xdg-open', [url], { stdio: 'ignore' });
    if (result.status !== 0) {
      throw new Error(`Failed to open browser for ${url}`);
    }
  },
  async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
  killProcess(pid: number, signal: NodeJS.Signals): void {
    process.kill(pid, signal);
  },
  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (isNodeErrorWithCode(error) && error.code === 'ESRCH') {
        return false;
      }
      return true;
    }
  },
};

export async function startOrReuseWorkspaceReportServer(
  options: StartReportServerOptions,
): Promise<ReportServerSession> {
  const existing = await resolveHealthyWorkspaceReportServer(options.workspace);
  if (existing) {
    return {
      state: existing,
      url: existing.url,
      reused: true,
    };
  }

  const port = await findAvailablePort(options.requestedPort ?? DEFAULT_REPORT_SERVER_PORT);
  const mode = options.dev ? 'development' : 'production';

  const child = startReportWebProcess({
    workspace: options.workspace,
    port,
    mode,
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealthyWorkspaceReportServer({
    workspace: options.workspace,
    url,
  });

  const state: ReportServerState = {
    pid: child.pid ?? 0,
    port,
    url,
    workspaceRoot: options.workspace.rootDir,
    artifactsDir: options.workspace.artifactsDir,
    mode,
    startedAt: new Date().toISOString(),
  };
  await writeWorkspaceReportServerState(options.workspace, state);

  return {
    state,
    url,
    reused: false,
  };
}

export async function resolveHealthyWorkspaceReportServer(
  workspace: FinalRunWorkspace,
): Promise<ReportServerState | undefined> {
  const state = await readWorkspaceReportServerState(workspace);
  if (!state) {
    return undefined;
  }

  const health = await probeWorkspaceReportServerHealth(state, workspace);
  if (health.healthy) {
    return {
      ...state,
      pid: health.livePid ?? state.pid,
    };
  }

  await clearWorkspaceReportServerState(workspace);
  return undefined;
}

export async function getWorkspaceReportServerStatus(
  workspace: FinalRunWorkspace,
): Promise<WorkspaceReportServerStatus> {
  const state = await readWorkspaceReportServerState(workspace);
  if (!state) {
    return {
      running: false,
      healthy: false,
      staleStateCleared: false,
    };
  }

  const health = await probeWorkspaceReportServerHealth(state, workspace);
  if (!health.healthy) {
    await clearWorkspaceReportServerState(workspace);
    return {
      running: false,
      healthy: false,
      staleStateCleared: true,
    };
  }

  return {
    running: true,
    healthy: true,
    staleStateCleared: false,
    livePid: health.livePid,
    state: {
      ...state,
      pid: health.livePid ?? state.pid,
    },
  };
}

export async function stopWorkspaceReportServer(
  workspace: FinalRunWorkspace,
): Promise<StopWorkspaceReportServerResult> {
  const status = await getWorkspaceReportServerStatus(workspace);
  if (!status.running || !status.state) {
    return {
      stopped: false,
      staleStateCleared: status.staleStateCleared,
    };
  }

  let livePid = status.livePid;
  if (livePid === undefined) {
    const health = await probeWorkspaceReportServerHealth(status.state, workspace);
    if (!health.healthy) {
      await clearWorkspaceReportServerState(workspace);
      return {
        stopped: false,
        staleStateCleared: true,
      };
    }
    livePid = health.livePid;
  }

  if (livePid === undefined) {
    throw new Error(
      `Could not safely stop the FinalRun report server for ${workspace.rootDir} because the live server did not report a pid.`,
    );
  }

  const pid = livePid;
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(
      `Healthy FinalRun report server did not report a valid pid for ${workspace.rootDir}.`,
    );
  }

  const stopState: ReportServerState = {
    ...status.state,
    pid,
  };

  try {
    reportServerManagerDependencies.killProcess(pid, 'SIGTERM');
  } catch (error) {
    if (!isNodeErrorWithCode(error) || error.code !== 'ESRCH') {
      throw error;
    }
  }

  await waitForWorkspaceReportServerShutdown({
    workspace,
    state: stopState,
  });
  await clearWorkspaceReportServerState(workspace);

  return {
    stopped: true,
    staleStateCleared: false,
    state: stopState,
  };
}

export interface StopAllReportServersResult {
  killedPids: number[];
  clearedStateFiles: string[];
}

/**
 * Stop every FinalRun report-server process owned by the current user, plus
 * sweep any leftover .server.json state files under ~/.finalrun/workspaces.
 *
 * Identifies servers by the `internal-report-server` argv marker, so the
 * blast radius is bounded to processes the CLI itself would have spawned —
 * not arbitrary node processes the user may have running.
 */
export async function stopAllReportServers(): Promise<StopAllReportServersResult> {
  const killedPids = killOrphanReportServerProcesses();
  const clearedStateFiles = await sweepWorkspaceReportServerStateFiles();
  return { killedPids, clearedStateFiles };
}

function killOrphanReportServerProcesses(): number[] {
  // Best-effort discovery via `ps`. macOS / Linux ps differ slightly but both
  // accept `-x -o pid=,command=` for "all my processes, just the pid+argv".
  const ps = spawnSync('ps', ['-x', '-o', 'pid=,command='], {
    encoding: 'utf-8',
  });
  if (ps.status !== 0 || typeof ps.stdout !== 'string') {
    return [];
  }
  const myPid = process.pid;
  const killed: number[] = [];
  for (const line of ps.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const pid = parseInt(match[1] ?? '', 10);
    const cmd = match[2] ?? '';
    if (!Number.isFinite(pid) || pid === myPid) continue;
    // Marker has to be specific enough that we don't kill a test runner or
    // an editor that happens to have these strings open.
    if (!/\bfinalrun(?:-agent|\.js|\.ts)?\b/.test(cmd)) continue;
    if (!/\binternal-report-server\b/.test(cmd)) continue;
    try {
      reportServerManagerDependencies.killProcess(pid, 'SIGTERM');
      killed.push(pid);
    } catch {
      // ESRCH or permission — ignore; nothing more we can do.
    }
  }
  return killed;
}

async function sweepWorkspaceReportServerStateFiles(): Promise<string[]> {
  const cleared: string[] = [];
  const workspacesRoot = path.join(resolveFinalRunRootDir(), 'workspaces');
  let entries: string[];
  try {
    entries = await fsp.readdir(workspacesRoot);
  } catch {
    return cleared;
  }
  for (const entry of entries) {
    const stateFile = path.join(workspacesRoot, entry, 'artifacts', '.server.json');
    try {
      await fsp.unlink(stateFile);
      cleared.push(stateFile);
    } catch {
      // ENOENT (no state file in this workspace) is the common case — skip.
    }
  }
  return cleared;
}

export async function openReportUrl(url: string): Promise<void> {
  await reportServerManagerDependencies.openBrowser(url);
}

export function buildWorkspaceReportUrl(serverUrl: string): string {
  return serverUrl;
}

export function buildRunReportUrl(serverUrl: string, runId: string): string {
  return `${serverUrl.replace(/\/+$/, '')}/runs/${encodeURIComponent(runId)}`;
}

export async function readWorkspaceReportServerState(
  workspace: FinalRunWorkspace,
): Promise<ReportServerState | undefined> {
  try {
    const raw = await fsp.readFile(getWorkspaceReportServerStatePath(workspace), 'utf-8');
    return JSON.parse(raw) as ReportServerState;
  } catch {
    return undefined;
  }
}

export async function writeWorkspaceReportServerState(
  workspace: FinalRunWorkspace,
  state: ReportServerState,
): Promise<void> {
  await fsp.mkdir(workspace.artifactsDir, { recursive: true });
  await fsp.writeFile(
    getWorkspaceReportServerStatePath(workspace),
    JSON.stringify(state, null, 2),
    'utf-8',
  );
}

export async function clearWorkspaceReportServerState(
  workspace: FinalRunWorkspace,
): Promise<void> {
  await fsp.rm(getWorkspaceReportServerStatePath(workspace), { force: true });
}

export function getWorkspaceReportServerStatePath(workspace: FinalRunWorkspace): string {
  return path.join(workspace.artifactsDir, '.server.json');
}

async function isHealthyWorkspaceReportServer(
  state: ReportServerState,
  workspace: FinalRunWorkspace,
): Promise<boolean> {
  return (await probeWorkspaceReportServerHealth(state, workspace)).healthy;
}

async function waitForHealthyWorkspaceReportServer(params: {
  workspace: FinalRunWorkspace;
  url: string;
}): Promise<void> {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const state: ReportServerState = {
      pid: 0,
      port: new URL(params.url).port
        ? parseInt(new URL(params.url).port, 10)
        : DEFAULT_REPORT_SERVER_PORT,
      url: params.url,
      workspaceRoot: params.workspace.rootDir,
      artifactsDir: params.workspace.artifactsDir,
      mode: 'production',
      startedAt: new Date().toISOString(),
    };
    if (await isHealthyWorkspaceReportServer(state, params.workspace)) {
      return;
    }
    await reportServerManagerDependencies.sleep(250);
  }
  throw new Error('Timed out waiting for the FinalRun report server to become healthy.');
}

async function waitForWorkspaceReportServerShutdown(params: {
  workspace: FinalRunWorkspace;
  state: ReportServerState;
}): Promise<void> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const health = await probeWorkspaceReportServerHealth(params.state, params.workspace);
    if (!health.healthy) {
      return;
    }
    if (!reportServerManagerDependencies.isProcessAlive(params.state.pid)) {
      return;
    }
    await reportServerManagerDependencies.sleep(250);
  }

  throw new Error('Timed out waiting for the FinalRun report server to stop.');
}

async function probeWorkspaceReportServerHealth(
  state: ReportServerState,
  workspace: FinalRunWorkspace,
): Promise<{ healthy: boolean; livePid?: number }> {
  try {
    const health = await fetchWorkspaceReportServerHealth(`${state.url}${HEALTH_ROUTE}`);
    if (health.status !== 200) {
      return { healthy: false };
    }
    const body = isReportHealthPayload(health.body) ? health.body : undefined;
    if (!body) {
      return { healthy: false };
    }
    const livePid =
      typeof body.pid === 'number' && Number.isInteger(body.pid) && body.pid > 0
        ? body.pid
        : undefined;
    return {
      healthy: body.status === 'ok' &&
        body.workspaceRoot === workspace.rootDir &&
        body.artifactsDir === workspace.artifactsDir,
      livePid,
    };
  } catch {
    return { healthy: false };
  }
}

async function fetchWorkspaceReportServerHealth(
  url: string,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, reportServerManagerDependencies.healthProbeTimeoutMs);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      reportServerManagerDependencies.fetchJson(url, controller.signal),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Health probe timed out.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function startReportWebProcess(params: {
  workspace: FinalRunWorkspace;
  port: number;
  mode: 'production' | 'development';
}): ChildProcess {
  const args = resolveCliLaunchArgs([
    'internal-report-server',
    '--workspace-root',
    params.workspace.rootDir,
    '--artifacts-dir',
    params.workspace.artifactsDir,
    '--port',
    String(params.port),
    '--mode',
    params.mode,
  ]);
  const child = reportServerManagerDependencies.spawnProcess(
    process.execPath,
    args,
    {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: process.env,
    },
  );
  child.unref();
  return child;
}

async function findAvailablePort(startingPort: number): Promise<number> {
  if (startingPort === 0) {
    return await getEphemeralPort();
  }

  let candidate = Math.max(0, startingPort);
  while (candidate < startingPort + 20) {
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
    candidate += 1;
  }
  // 20-port window exhausted (typically: leftover zombie report servers from
  // earlier runs holding 4173..4192). Don't wedge the user — fall through to
  // an OS-assigned ephemeral port instead of erroring out.
  return await getEphemeralPort();
}

async function isPortAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function isReportHealthPayload(value: unknown): value is ReportHealthPayload {
  return typeof value === 'object' && value !== null;
}

function isNodeErrorWithCode(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

async function getEphemeralPort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate an ephemeral port.')));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}
