import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ChildProcess, SpawnSyncReturns } from 'node:child_process';
import type { ReportServerStateRecord } from '@finalrun/common';
import {
  buildRunReportUrl,
  openReportUrl,
  readWorkspaceReportServerState,
  reportServerManagerDependencies,
  resolveHealthyWorkspaceReportServer,
  startOrReuseWorkspaceReportServer,
  writeWorkspaceReportServerState,
} from './reportServerManager.js';
import type { FinalRunWorkspace } from './workspace.js';

function createWorkspace(): FinalRunWorkspace {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-manager-'));
  const finalrunDir = path.join(rootDir, '.finalrun');
  const testsDir = path.join(finalrunDir, 'tests');
  const suitesDir = path.join(finalrunDir, 'suites');
  const envDir = path.join(finalrunDir, 'env');
  const artifactsDir = path.join(finalrunDir, 'artifacts');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(suitesDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
  return {
    rootDir,
    finalrunDir,
    testsDir,
    suitesDir,
    envDir,
    artifactsDir,
  };
}

function createServerState(workspace: FinalRunWorkspace): ReportServerStateRecord {
  return {
    pid: 4321,
    port: 4173,
    url: 'http://127.0.0.1:4173',
    workspaceRoot: workspace.rootDir,
    artifactsDir: workspace.artifactsDir,
    mode: 'production',
    startedAt: '2026-03-24T18:00:00.000Z',
  };
}

function createSpawnedChild(pid: number): ChildProcess {
  return {
    pid,
    unref() {},
  } as ChildProcess;
}

function createSuccessfulCommandResult(): SpawnSyncReturns<string> {
  return {
    status: 0,
    pid: 7331,
    output: ['', '', ''],
    stdout: '',
    stderr: '',
    signal: null,
  };
}

async function findAvailablePort(): Promise<number> {
  const net = await import('node:net');
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('No ephemeral port allocated.')));
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

test('resolveHealthyWorkspaceReportServer returns the persisted state for a healthy workspace server', async () => {
  const workspace = createWorkspace();
  const originalFetchJson = reportServerManagerDependencies.fetchJson;

  try {
    await writeWorkspaceReportServerState(workspace, createServerState(workspace));
    reportServerManagerDependencies.fetchJson = async () => ({
      status: 200,
      body: {
        status: 'ok',
        workspaceRoot: workspace.rootDir,
        artifactsDir: workspace.artifactsDir,
      },
    });

    const state = await resolveHealthyWorkspaceReportServer(workspace);
    assert.equal(state?.url, 'http://127.0.0.1:4173');
  } finally {
    reportServerManagerDependencies.fetchJson = originalFetchJson;
    await fsp.rm(workspace.rootDir, { recursive: true, force: true });
  }
});

test('resolveHealthyWorkspaceReportServer clears stale state when the health check fails', async () => {
  const workspace = createWorkspace();
  const originalFetchJson = reportServerManagerDependencies.fetchJson;

  try {
    await writeWorkspaceReportServerState(workspace, createServerState(workspace));
    reportServerManagerDependencies.fetchJson = async () => {
      throw new Error('connection refused');
    };

    const state = await resolveHealthyWorkspaceReportServer(workspace);
    assert.equal(state, undefined);
    const persistedState = await readWorkspaceReportServerState(workspace);
    assert.equal(persistedState, undefined);
  } finally {
    reportServerManagerDependencies.fetchJson = originalFetchJson;
    await fsp.rm(workspace.rootDir, { recursive: true, force: true });
  }
});

test('startOrReuseWorkspaceReportServer reuses an already healthy server without spawning a new one', async () => {
  const workspace = createWorkspace();
  const originalFetchJson = reportServerManagerDependencies.fetchJson;
  const originalSpawnProcess = reportServerManagerDependencies.spawnProcess;
  const originalRunCommand = reportServerManagerDependencies.runCommand;
  let spawnCalls = 0;
  let buildCalls = 0;

  try {
    await writeWorkspaceReportServerState(workspace, createServerState(workspace));
    reportServerManagerDependencies.fetchJson = async () => ({
      status: 200,
      body: {
        status: 'ok',
        workspaceRoot: workspace.rootDir,
        artifactsDir: workspace.artifactsDir,
      },
    });
    reportServerManagerDependencies.spawnProcess = () => {
      spawnCalls += 1;
      return createSpawnedChild(9001);
    };
    reportServerManagerDependencies.runCommand = () => {
      buildCalls += 1;
      return createSuccessfulCommandResult();
    };

    const result = await startOrReuseWorkspaceReportServer({
      workspace,
      requestedPort: 4173,
    });

    assert.equal(result.reused, true);
    assert.equal(result.url, 'http://127.0.0.1:4173');
    assert.equal(spawnCalls, 0);
    assert.equal(buildCalls, 0);
  } finally {
    reportServerManagerDependencies.fetchJson = originalFetchJson;
    reportServerManagerDependencies.spawnProcess = originalSpawnProcess;
    reportServerManagerDependencies.runCommand = originalRunCommand;
    await fsp.rm(workspace.rootDir, { recursive: true, force: true });
  }
});

test('startOrReuseWorkspaceReportServer starts a new server, waits for health, and persists .server.json', async () => {
  const workspace = createWorkspace();
  const originalFetchJson = reportServerManagerDependencies.fetchJson;
  const originalSpawnProcess = reportServerManagerDependencies.spawnProcess;
  const originalRunCommand = reportServerManagerDependencies.runCommand;
  const originalSleep = reportServerManagerDependencies.sleep;
  let healthChecks = 0;
  let buildArgs: string[] = [];
  let spawnArgs: string[] = [];
  const requestedPort = await findAvailablePort();

  try {
    reportServerManagerDependencies.runCommand = (_command, args) => {
      buildArgs = args;
      return createSuccessfulCommandResult();
    };
    reportServerManagerDependencies.spawnProcess = (_command, args) => {
      spawnArgs = args;
      return createSpawnedChild(7331);
    };
    reportServerManagerDependencies.fetchJson = async () => {
      healthChecks += 1;
      if (healthChecks < 2) {
        throw new Error('booting');
      }
      return {
        status: 200,
        body: {
          status: 'ok',
          workspaceRoot: workspace.rootDir,
          artifactsDir: workspace.artifactsDir,
        },
      };
    };
    reportServerManagerDependencies.sleep = async () => {};

    const result = await startOrReuseWorkspaceReportServer({
      workspace,
      requestedPort,
    });

    assert.equal(result.reused, false);
    assert.equal(result.state.pid, 7331);
    assert.equal(result.state.port, requestedPort);
    assert.equal(result.url, `http://127.0.0.1:${requestedPort}`);
    assert.match(buildArgs[0] ?? '', /next[\\/]dist[\\/]bin[\\/]next/);
    assert.doesNotMatch(buildArgs[0] ?? '', new RegExp(workspace.rootDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(spawnArgs[0] ?? '', /next[\\/]dist[\\/]bin[\\/]next/);
    const persisted = await readWorkspaceReportServerState(workspace);
    assert.equal(persisted?.port, requestedPort);
  } finally {
    reportServerManagerDependencies.fetchJson = originalFetchJson;
    reportServerManagerDependencies.spawnProcess = originalSpawnProcess;
    reportServerManagerDependencies.runCommand = originalRunCommand;
    reportServerManagerDependencies.sleep = originalSleep;
    await fsp.rm(workspace.rootDir, { recursive: true, force: true });
  }
});

test('openReportUrl delegates to the browser opener and buildRunReportUrl targets the run route', async () => {
  const originalOpenBrowser = reportServerManagerDependencies.openBrowser;
  let openedUrl = '';

  try {
    reportServerManagerDependencies.openBrowser = async (url: string) => {
      openedUrl = url;
    };

    const runUrl = buildRunReportUrl('http://127.0.0.1:4173', '2026-03-24T18-00-00.000Z-dev-android');
    await openReportUrl(runUrl);
    assert.equal(
      openedUrl,
      'http://127.0.0.1:4173/runs/2026-03-24T18-00-00.000Z-dev-android',
    );
  } finally {
    reportServerManagerDependencies.openBrowser = originalOpenBrowser;
  }
});
