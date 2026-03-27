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
import { renderRunIndexHtml } from './reportIndexTemplate.js';
import { renderHtmlReport } from './reportTemplate.js';

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
        response.end(renderRunIndexHtml(toRunIndexViewModel(index)));
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
        response.end(renderHtmlReport(toRunManifestViewModel(manifest)));
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

function toRunIndexViewModel(index: RunIndexRecord): RunIndexRecord {
  return {
    ...index,
    runs: index.runs.map((run) => ({
      ...run,
      paths: {
        ...run.paths,
        log: buildArtifactRoute(run.paths.log),
        runJson: buildArtifactRoute(run.paths.runJson),
      },
    })),
  };
}

function toRunManifestViewModel(manifest: RunManifestRecord): RunManifestRecord {
  const runId = manifest.run.runId;
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
      specs: manifest.input.specs.map((spec) => toSelectedSpecViewModel(runId, spec)),
    },
    specs: manifest.specs.map((spec) => toSpecViewModel(runId, spec)),
    paths: {
      ...manifest.paths,
      runJson: buildRunScopedArtifactPath(runId, manifest.paths.runJson),
      summaryJson: buildRunScopedArtifactPath(runId, manifest.paths.summaryJson),
      log: buildRunScopedArtifactPath(runId, manifest.paths.log),
      runContextJson: manifest.paths.runContextJson
        ? buildRunScopedArtifactPath(runId, manifest.paths.runContextJson)
        : undefined,
    },
  };
}

function toSelectedSpecViewModel(
  runId: string,
  spec: RunManifestSelectedSpecRecord,
): RunManifestSelectedSpecRecord {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
  };
}

function toSpecViewModel(runId: string, spec: RunManifestSpecRecord): RunManifestSpecRecord {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
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
