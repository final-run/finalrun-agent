import * as fsp from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import type { ReportServerState } from '@finalrun/common';
import type { FinalRunWorkspace } from './workspace.js';
import { resolveCliLaunchArgs } from './runtimePaths.js';

const DEFAULT_REPORT_SERVER_PORT = 4173;
const HEALTH_ROUTE = '/health';

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

export const reportServerManagerDependencies = {
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
  runCommand(
    command: string,
    args: string[],
    options: {
      cwd: string;
      env?: NodeJS.ProcessEnv;
    },
  ) {
    return spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
  },
  async fetchJson(url: string): Promise<{ status: number; body: unknown }> {
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
      },
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

  const healthy = await isHealthyWorkspaceReportServer(state, workspace);
  if (healthy) {
    return state;
  }

  await clearWorkspaceReportServerState(workspace);
  return undefined;
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
  try {
    const health = await reportServerManagerDependencies.fetchJson(
      `${state.url}${HEALTH_ROUTE}`,
    );
    if (health.status !== 200) {
      return false;
    }
    const body = health.body as ReportHealthPayload;
    return body.status === 'ok' &&
      body.workspaceRoot === workspace.rootDir &&
      body.artifactsDir === workspace.artifactsDir;
  } catch {
    return false;
  }
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
  throw new Error(`Could not find an open port near ${startingPort}.`);
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
