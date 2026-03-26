import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ArtifactRangeNotSatisfiableError,
  loadArtifactResponse,
  type ReportWorkspaceContext,
} from './artifacts';

function createWorkspaceContext(): ReportWorkspaceContext {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-artifacts-'));
  const artifactsDir = path.join(workspaceRoot, '.finalrun', 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  return {
    workspaceRoot,
    artifactsDir,
  };
}

test('loadArtifactResponse returns full-file headers for artifact reads', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await loadArtifactResponse(['runs', 'clip.mp4'], undefined, context);

    assert.equal(response.status, 200);
    assert.equal(response.contentType, 'video/mp4');
    assert.equal(response.headers['accept-ranges'], 'bytes');
    assert.equal(response.headers['content-length'], '10');
    assert.equal(response.headers['content-type'], 'video/mp4');
  } finally {
    await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  }
});

test('loadArtifactResponse serves byte ranges for seekable media playback', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await loadArtifactResponse(['runs', 'clip.mp4'], 'bytes=2-5', context);

    assert.equal(response.status, 206);
    assert.equal(response.headers['accept-ranges'], 'bytes');
    assert.equal(response.headers['content-length'], '4');
    assert.equal(response.headers['content-range'], 'bytes 2-5/10');
  } finally {
    await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  }
});

test('loadArtifactResponse rejects byte ranges outside the artifact size', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    await assert.rejects(
      loadArtifactResponse(['runs', 'clip.mp4'], 'bytes=25-30', context),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactRangeNotSatisfiableError);
        assert.equal(error.size, 10);
        return true;
      },
    );
  } finally {
    await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  }
});
