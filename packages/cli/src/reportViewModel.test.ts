import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  RunManifestNotFoundError,
  loadRunManifestRecord,
  safeResolveWithin,
  type ReportWorkspaceContext,
} from './reportViewModel.js';

function mkArtifactsDir(): { artifactsDir: string; cleanup: () => void } {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-vm-'));
  return {
    artifactsDir,
    cleanup: () => {
      fs.rmSync(artifactsDir, { recursive: true, force: true });
    },
  };
}

test('safeResolveWithin returns the resolved path for an in-bounds segment', () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    const resolved = safeResolveWithin(artifactsDir, 'run-1', 'run.json');
    assert.equal(resolved, path.join(artifactsDir, 'run-1', 'run.json'));
  } finally {
    cleanup();
  }
});

test('safeResolveWithin returns the base when no extra segments are passed', () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    const resolved = safeResolveWithin(artifactsDir);
    assert.equal(resolved, path.resolve(artifactsDir));
  } finally {
    cleanup();
  }
});

test('safeResolveWithin rejects parent-traversal segments', () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    assert.equal(safeResolveWithin(artifactsDir, '..', 'etc', 'passwd'), undefined);
    assert.equal(safeResolveWithin(artifactsDir, '../../../etc/passwd'), undefined);
  } finally {
    cleanup();
  }
});

test('safeResolveWithin rejects absolute segments that escape the base', () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    assert.equal(safeResolveWithin(artifactsDir, '/etc/passwd'), undefined);
  } finally {
    cleanup();
  }
});

test('loadRunManifestRecord throws RunManifestNotFoundError for traversal runIds', async () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  const context: ReportWorkspaceContext = { workspaceRoot: artifactsDir, artifactsDir };
  try {
    await assert.rejects(
      () => loadRunManifestRecord('../../../etc/passwd', context),
      (error: Error) => error instanceof RunManifestNotFoundError,
    );
  } finally {
    cleanup();
  }
});

test('loadRunManifestRecord throws RunManifestNotFoundError for missing runs', async () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  const context: ReportWorkspaceContext = { workspaceRoot: artifactsDir, artifactsDir };
  try {
    await assert.rejects(
      () => loadRunManifestRecord('does-not-exist', context),
      (error: Error) => error instanceof RunManifestNotFoundError,
    );
  } finally {
    cleanup();
  }
});

test('loadRunManifestRecord surfaces non-ENOENT errors as generic errors', async () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    const context: ReportWorkspaceContext = { workspaceRoot: artifactsDir, artifactsDir };
    const runDir = path.join(artifactsDir, 'corrupt-run');
    await fsp.mkdir(runDir, { recursive: true });
    await fsp.writeFile(path.join(runDir, 'run.json'), 'this is not json', 'utf-8');
    await assert.rejects(
      () => loadRunManifestRecord('corrupt-run', context),
      (error: Error) => !(error instanceof RunManifestNotFoundError),
    );
  } finally {
    cleanup();
  }
});

test('loadRunManifestRecord rejects unsupported schema versions with a generic error', async () => {
  const { artifactsDir, cleanup } = mkArtifactsDir();
  try {
    const context: ReportWorkspaceContext = { workspaceRoot: artifactsDir, artifactsDir };
    const runDir = path.join(artifactsDir, 'old-schema');
    await fsp.mkdir(runDir, { recursive: true });
    await fsp.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify({ schemaVersion: 1 }),
      'utf-8',
    );
    await assert.rejects(
      () => loadRunManifestRecord('old-schema', context),
      (error: Error) =>
        !(error instanceof RunManifestNotFoundError) &&
        /Unsupported schema version/.test(error.message),
    );
  } finally {
    cleanup();
  }
});
