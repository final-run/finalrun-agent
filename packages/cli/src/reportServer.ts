import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createServer } from 'node:http';
import type {
  RunIndexEntryRecord,
  RunIndexRecord,
  RunManifestRecord,
  RunManifestSelectedSpecRecord,
  RunManifestSpecRecord,
} from '@finalrun/common';
import { loadRunIndex } from './runIndex.js';
import {
  renderRunIndexHtml,
  type ReportIndexRunRecord,
  type ReportIndexViewModel,
} from './reportIndexTemplate.js';
import {
  renderHtmlReport,
  type ReportManifestSelectedSpecRecord,
  type ReportManifestSpecRecord,
  type ReportRunManifestRecord,
} from './reportTemplate.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

export async function serveReportWorkspace(params: {
  workspaceRoot: string;
  artifactsDir: string;
  port: number;
}): Promise<{ url: string; close(): Promise<void> }> {
  const rootDir = path.resolve(params.artifactsDir);
  const workspaceRoot = path.resolve(params.workspaceRoot);

  const server = createServer(async (request, response) => {
    try {
      const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

      if (requestPath === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
          status: 'ok',
          workspaceRoot,
          artifactsDir: rootDir,
          pid: process.pid,
        }));
        return;
      }

      if (requestPath === '/') {
        const index = await loadRunIndex(rootDir);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderRunIndexHtml(await buildReportIndexViewModel(index, rootDir)));
        return;
      }

      const runMatch = /^\/runs\/([^/]+)$/.exec(requestPath);
      if (runMatch) {
        const runId = decodeURIComponent(runMatch[1] ?? '');
        const manifest = await loadRunManifest(rootDir, runId);
        if (!manifest) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end(`Run not found: ${runId}`);
          return;
        }

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderHtmlReport(await buildReportRunManifestViewModel(manifest, rootDir)));
        return;
      }

      if (requestPath.startsWith('/artifacts/')) {
        await serveArtifactFile({
          artifactsDir: rootDir,
          relativePath: decodeArtifactPath(requestPath.slice('/artifacts/'.length)),
          rangeHeader: request.headers.range,
          response,
        });
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(params.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine report server address.');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function loadRunManifest(
  artifactsDir: string,
  runId: string,
): Promise<RunManifestRecord | undefined> {
  try {
    const raw = await fsp.readFile(path.join(artifactsDir, runId, 'run.json'), 'utf-8');
    return JSON.parse(raw) as RunManifestRecord;
  } catch {
    return undefined;
  }
}

async function serveArtifactFile(params: {
  artifactsDir: string;
  relativePath: string;
  rangeHeader?: string | string[];
  response: NodeJS.WritableStream & {
    writeHead(statusCode: number, headers: Record<string, string>): void;
    end(chunk?: string): void;
  };
}): Promise<void> {
  const resolvedPath = path.resolve(params.artifactsDir, params.relativePath);
  if (!resolvedPath.startsWith(params.artifactsDir)) {
    params.response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    params.response.end('Forbidden');
    return;
  }

  let stats;
  try {
    stats = await fsp.stat(resolvedPath);
  } catch {
    params.response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    params.response.end('Not found');
    return;
  }

  if (!stats.isFile()) {
    params.response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    params.response.end('Not found');
    return;
  }

  const rangeHeader = Array.isArray(params.rangeHeader)
    ? params.rangeHeader[0]
    : params.rangeHeader;
  const byteRange = parseByteRange(rangeHeader, stats.size);
  const contentType =
    CONTENT_TYPES[path.extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream';

  if (byteRange) {
    params.response.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(byteRange.end - byteRange.start + 1),
      'Content-Range': `bytes ${byteRange.start}-${byteRange.end}/${stats.size}`,
      'Content-Type': contentType,
    });
    fs.createReadStream(resolvedPath, {
      start: byteRange.start,
      end: byteRange.end,
    }).pipe(params.response);
    return;
  }

  params.response.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': String(stats.size),
    'Content-Type': contentType,
  });
  fs.createReadStream(resolvedPath).pipe(params.response);
}

function parseByteRange(
  rangeHeader: string | undefined,
  totalSize: number,
): { start: number; end: number } | undefined {
  if (!rangeHeader) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return undefined;
  }

  const [, startValue, endValue] = match;
  if (startValue === '' && endValue === '') {
    return undefined;
  }

  if (startValue === '') {
    const suffixLength = parseInt(endValue, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return undefined;
    }
    const start = Math.max(0, totalSize - suffixLength);
    return { start, end: totalSize - 1 };
  }

  const start = parseInt(startValue, 10);
  const requestedEnd = endValue === '' ? totalSize - 1 : parseInt(endValue, 10);
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) {
    return undefined;
  }
  if (start < 0 || start >= totalSize) {
    return undefined;
  }

  const end = Math.min(requestedEnd, totalSize - 1);
  if (end < start) {
    return undefined;
  }

  return { start, end };
}

function decodeArtifactPath(rawRelativePath: string): string {
  return rawRelativePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
    .join('/');
}

function buildRunRoute(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

function buildArtifactRoute(relativePath: string): string {
  return `/artifacts/${relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

export async function buildReportIndexViewModel(
  index: RunIndexRecord,
  artifactsDir: string,
): Promise<ReportIndexViewModel> {
  const runs = await Promise.all(
    index.runs.map(async (run) => await enrichRunIndexEntry(run, artifactsDir)),
  );
  const passedRuns = runs.filter((run) => run.success).length;

  return {
    generatedAt: index.generatedAt,
    summary: {
      totalRuns: runs.length,
      totalSuccessRate: runs.length === 0 ? 0 : (passedRuns / runs.length) * 100,
      totalDurationMs: runs.reduce((total, run) => total + Number(run.durationMs || 0), 0),
    },
    runs,
  };
}

export async function buildReportRunManifestViewModel(
  manifest: RunManifestRecord,
  artifactsDir: string,
): Promise<ReportRunManifestRecord> {
  const runId = manifest.run.runId;
  const snapshotCache = new Map<string, Promise<string | undefined>>();
  const readSnapshotYamlText = async (snapshotYamlPath: string): Promise<string | undefined> => {
    let cached = snapshotCache.get(snapshotYamlPath);
    if (!cached) {
      cached = readRunArtifactText(artifactsDir, runId, snapshotYamlPath);
      snapshotCache.set(snapshotYamlPath, cached);
    }
    return await cached;
  };

  return {
    ...manifest,
    input: {
      ...manifest.input,
      suite: manifest.input.suite
        ? {
            ...manifest.input.suite,
            snapshotYamlPath: buildRunScopedArtifactPath(runId, manifest.input.suite.snapshotYamlPath),
            snapshotJsonPath: buildRunScopedArtifactPath(runId, manifest.input.suite.snapshotJsonPath),
          }
        : undefined,
      specs: await Promise.all(
        manifest.input.specs.map(async (spec) => await toSelectedSpecViewModel(runId, spec, readSnapshotYamlText)),
      ),
    },
    specs: await Promise.all(
      manifest.specs.map(async (spec) => await toSpecViewModel(runId, spec, readSnapshotYamlText)),
    ),
    paths: {
      runJson: buildRunScopedArtifactPath(runId, 'run.json'),
      summaryJson: buildRunScopedArtifactPath(runId, 'summary.json'),
      log: buildRunScopedArtifactPath(runId, 'runner.log'),
      runContextJson: buildRunScopedArtifactPath(runId, 'input/run-context.json'),
    },
  };
}

async function toSelectedSpecViewModel(
  runId: string,
  spec: RunManifestSelectedSpecRecord,
  readSnapshotYamlText: (snapshotYamlPath: string) => Promise<string | undefined>,
): Promise<ReportManifestSelectedSpecRecord> {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
    snapshotYamlText: await readSnapshotYamlText(spec.snapshotYamlPath),
  };
}

async function toSpecViewModel(
  runId: string,
  spec: RunManifestSpecRecord,
  readSnapshotYamlText: (snapshotYamlPath: string) => Promise<string | undefined>,
): Promise<ReportManifestSpecRecord> {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
    snapshotYamlText: await readSnapshotYamlText(spec.snapshotYamlPath),
    previewScreenshotPath: spec.previewScreenshotPath
      ? buildRunScopedArtifactPath(runId, spec.previewScreenshotPath)
      : undefined,
    resultJsonPath: buildRunScopedArtifactPath(runId, spec.resultJsonPath),
    recordingFile: spec.recordingFile
      ? buildRunScopedArtifactPath(runId, spec.recordingFile)
      : undefined,
    steps: spec.steps.map((step) => ({
      ...step,
      screenshotFile: step.screenshotFile
        ? buildRunScopedArtifactPath(runId, step.screenshotFile)
        : undefined,
      stepJsonFile: step.stepJsonFile
        ? buildRunScopedArtifactPath(runId, step.stepJsonFile)
        : undefined,
    })),
    firstFailure: spec.firstFailure
      ? {
          ...spec.firstFailure,
          screenshotPath: spec.firstFailure.screenshotPath
            ? buildRunScopedArtifactPath(runId, spec.firstFailure.screenshotPath)
            : undefined,
          stepJsonPath: spec.firstFailure.stepJsonPath
            ? buildRunScopedArtifactPath(runId, spec.firstFailure.stepJsonPath)
            : undefined,
        }
      : undefined,
  };
}

function buildRunScopedArtifactPath(runId: string, relativePath: string): string {
  return buildArtifactRoute(`${runId}/${relativePath}`);
}

async function readRunArtifactText(
  artifactsDir: string,
  runId: string,
  artifactPath: string,
): Promise<string | undefined> {
  const normalizedPath = normalizeRunArtifactPath(runId, artifactPath);
  if (!normalizedPath) {
    return undefined;
  }

  try {
    return await fsp.readFile(path.join(artifactsDir, runId, normalizedPath), 'utf-8');
  } catch {
    return undefined;
  }
}

function normalizeRunArtifactPath(runId: string, artifactPath: string): string | undefined {
  const normalized = artifactPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.length === 0) {
    return undefined;
  }

  if (!normalized.startsWith('artifacts/')) {
    return normalized;
  }

  const withoutArtifactsPrefix = normalized.slice('artifacts/'.length);
  if (withoutArtifactsPrefix.startsWith(`${runId}/`)) {
    return withoutArtifactsPrefix.slice(runId.length + 1);
  }

  return undefined;
}

async function enrichRunIndexEntry(
  run: RunIndexEntryRecord,
  artifactsDir: string,
): Promise<ReportIndexRunRecord> {
  const manifest = await loadRunManifest(artifactsDir, run.runId);
  const selectedSpecs = manifest?.input.specs ?? [];

  return {
    ...run,
    displayName: deriveRunDisplayName(run, manifest),
    displayKind: deriveRunDisplayKind(run, manifest),
    triggeredFrom: run.target?.type === 'suite' ? 'Suite' : 'Direct',
    selectedSpecCount: selectedSpecs.length > 0 ? selectedSpecs.length : run.totalTests,
    paths: {
      log: buildArtifactRoute(`${run.runId}/runner.log`),
      runJson: buildArtifactRoute(`${run.runId}/run.json`),
    },
  };
}

function deriveRunDisplayName(
  run: RunIndexEntryRecord,
  manifest: RunManifestRecord | undefined,
): string {
  if (run.target?.type === 'suite' && run.target.suiteName) {
    return run.target.suiteName;
  }

  const selectedSpecs = manifest?.input.specs ?? [];
  if (selectedSpecs.length === 1) {
    return selectedSpecs[0]?.specName || selectedSpecs[0]?.relativePath || run.runId;
  }
  if (selectedSpecs.length > 1) {
    const firstLabel =
      selectedSpecs[0]?.specName || selectedSpecs[0]?.relativePath || 'Selected specs';
    return `${firstLabel} +${selectedSpecs.length - 1} more`;
  }

  return run.runId;
}

function deriveRunDisplayKind(
  run: RunIndexEntryRecord,
  manifest: RunManifestRecord | undefined,
): ReportIndexRunRecord['displayKind'] {
  if (run.target?.type === 'suite') {
    return 'suite';
  }

  const selectedCount = manifest?.input.specs.length ?? run.totalTests;
  if (selectedCount === 1) {
    return 'single_spec';
  }
  if (selectedCount > 1) {
    return 'multi_spec';
  }

  return 'fallback';
}
