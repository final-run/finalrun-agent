import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { GET, HEAD } from '../app/artifacts/[...artifactPath]/route';

function createWorkspaceContext() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-route-'));
  const artifactsDir = path.join(workspaceRoot, '.finalrun', 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  return {
    workspaceRoot,
    artifactsDir,
  };
}

test('artifact GET returns partial content headers for range requests', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');
  const previousWorkspaceRoot = process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
  const previousArtifactsDir = process.env.FINALRUN_REPORT_ARTIFACTS_DIR;

  try {
    process.env.FINALRUN_REPORT_WORKSPACE_ROOT = context.workspaceRoot;
    process.env.FINALRUN_REPORT_ARTIFACTS_DIR = context.artifactsDir;
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await GET(
      new Request('http://127.0.0.1:4173/artifacts/runs/clip.mp4', {
        headers: {
          range: 'bytes=2-5',
        },
      }),
      {
        params: Promise.resolve({
          artifactPath: ['runs', 'clip.mp4'],
        }),
      },
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
    } else {
      process.env.FINALRUN_REPORT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousArtifactsDir === undefined) {
      delete process.env.FINALRUN_REPORT_ARTIFACTS_DIR;
    } else {
      process.env.FINALRUN_REPORT_ARTIFACTS_DIR = previousArtifactsDir;
    }
    await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  }
});

test('artifact HEAD preserves range headers without sending a response body', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');
  const previousWorkspaceRoot = process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
  const previousArtifactsDir = process.env.FINALRUN_REPORT_ARTIFACTS_DIR;

  try {
    process.env.FINALRUN_REPORT_WORKSPACE_ROOT = context.workspaceRoot;
    process.env.FINALRUN_REPORT_ARTIFACTS_DIR = context.artifactsDir;
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await HEAD(
      new Request('http://127.0.0.1:4173/artifacts/runs/clip.mp4', {
        method: 'HEAD',
        headers: {
          range: 'bytes=2-5',
        },
      }),
      {
        params: Promise.resolve({
          artifactPath: ['runs', 'clip.mp4'],
        }),
      },
    );

    assert.equal(response.status, 206);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(await response.text(), '');
  } finally {
    if (previousWorkspaceRoot === undefined) {
      delete process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
    } else {
      process.env.FINALRUN_REPORT_WORKSPACE_ROOT = previousWorkspaceRoot;
    }
    if (previousArtifactsDir === undefined) {
      delete process.env.FINALRUN_REPORT_ARTIFACTS_DIR;
    } else {
      process.env.FINALRUN_REPORT_ARTIFACTS_DIR = previousArtifactsDir;
    }
    await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  }
});
