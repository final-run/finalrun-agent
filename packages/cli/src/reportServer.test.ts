import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { rebuildRunIndex } from './runIndex.js';
import { serveReportWorkspace } from './reportServer.js';

async function withWorkspace<T>(
  body: (workspace: { workspaceRoot: string; artifactsDir: string }) => Promise<T>,
): Promise<T> {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-server-'));
  const artifactsDir = path.join(rootDir, 'artifacts');
  await fsp.mkdir(artifactsDir, { recursive: true });
  try {
    return await body({ workspaceRoot: rootDir, artifactsDir });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

async function withServer<T>(
  workspace: { workspaceRoot: string; artifactsDir: string },
  body: (baseUrl: string) => Promise<T>,
): Promise<T> {
  await rebuildRunIndex(workspace.artifactsDir);
  const server = await serveReportWorkspace({
    workspaceRoot: workspace.workspaceRoot,
    artifactsDir: workspace.artifactsDir,
    port: 0,
  });
  try {
    return await body(server.url);
  } finally {
    await server.close();
  }
}

test('GET /api/report/runs/:runId returns 404 when the run is missing', async () => {
  await withWorkspace(async (workspace) => {
    await withServer(workspace, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/report/runs/missing-run`);
      assert.equal(response.status, 404);
      const body = (await response.json()) as { status: string };
      assert.equal(body.status, 'error');
    });
  });
});

test('GET /api/report/runs/:runId returns 404 for path-traversal runIds', async () => {
  await withWorkspace(async (workspace) => {
    await withServer(workspace, async (baseUrl) => {
      const encoded = encodeURIComponent('../../../etc/passwd');
      const response = await fetch(`${baseUrl}/api/report/runs/${encoded}`);
      assert.equal(response.status, 404);
    });
  });
});

test('GET /api/report/runs/:runId returns 500 for corrupt run.json', async () => {
  await withWorkspace(async (workspace) => {
    const runDir = path.join(workspace.artifactsDir, 'corrupt-run');
    await fsp.mkdir(runDir, { recursive: true });
    await fsp.writeFile(path.join(runDir, 'run.json'), 'this is not json', 'utf-8');
    await withServer(workspace, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/report/runs/corrupt-run`);
      assert.equal(response.status, 500);
    });
  });
});
