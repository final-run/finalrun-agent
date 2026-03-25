import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type { RunIndexRecord, RunManifestRecord } from '@finalrun/common';
import { REPORT_CONTENT_TYPES } from './contentTypes';

const MISSING_WORKSPACE_CONFIG_ERROR =
  'The FinalRun report server is missing workspace configuration. Start it with `finalrun start-server`.';

export interface ReportWorkspaceContext {
  workspaceRoot: string;
  artifactsDir: string;
}

export class ArtifactRangeNotSatisfiableError extends Error {
  readonly size: number;

  constructor(size: number) {
    super('Requested artifact byte range is not satisfiable.');
    this.name = 'ArtifactRangeNotSatisfiableError';
    this.size = size;
  }
}

export function resolveReportWorkspaceContext(): ReportWorkspaceContext {
  const workspaceRoot = process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
  const artifactsDir = process.env.FINALRUN_REPORT_ARTIFACTS_DIR;
  if (!workspaceRoot || !artifactsDir) {
    throw new Error(MISSING_WORKSPACE_CONFIG_ERROR);
  }

  return {
    workspaceRoot,
    artifactsDir,
  };
}

export async function loadRunIndexRecord(
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<RunIndexRecord> {
  const indexPath = path.join(context.artifactsDir, 'runs.json');
  try {
    const raw = await fsp.readFile(indexPath, 'utf-8');
    return JSON.parse(raw) as RunIndexRecord;
  } catch {
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runs: [],
    };
  }
}

export async function loadRunManifestRecord(
  runId: string,
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<RunManifestRecord> {
  const runJsonPath = path.join(context.artifactsDir, runId, 'run.json');
  const raw = await fsp.readFile(runJsonPath, 'utf-8');
  return JSON.parse(raw) as RunManifestRecord;
}

export function buildRunRoute(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

export function buildArtifactRoute(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `/artifacts/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

export function resolveArtifactPath(
  artifactSegments: string[],
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): string {
  const relativeArtifactPath = artifactSegments.join('/');
  const normalizedRelativePath = relativeArtifactPath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const resolvedPath = path.resolve(context.artifactsDir, normalizedRelativePath);
  const relativeToArtifacts = path.relative(context.artifactsDir, resolvedPath);
  if (relativeToArtifacts.startsWith('..') || path.isAbsolute(relativeToArtifacts)) {
    throw new Error('Artifact paths must stay within the workspace artifacts directory.');
  }
  return resolvedPath;
}

export async function loadArtifactResponse(
  artifactSegments: string[],
  rangeHeader?: string | null,
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<{
  body: ReadableStream;
  contentType: string;
  status: number;
  headers: Record<string, string>;
}> {
  const filePath = resolveArtifactPath(artifactSegments, context);
  const stats = await fsp.stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`Artifact is not a file: ${filePath}`);
  }

  const contentType =
    REPORT_CONTENT_TYPES[path.extname(filePath).toLowerCase()] ??
    'application/octet-stream';
  const byteRange = parseByteRange(rangeHeader, stats.size);

  if (byteRange) {
    const contentLength = byteRange.end - byteRange.start + 1;
    return {
      body: Readable.toWeb(
        fs.createReadStream(filePath, {
          start: byteRange.start,
          end: byteRange.end,
        }),
      ) as ReadableStream,
      contentType,
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': String(contentLength),
        'content-range': `bytes ${byteRange.start}-${byteRange.end}/${stats.size}`,
        'content-type': contentType,
      },
    };
  }

  return {
    body: Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream,
    contentType,
    status: 200,
    headers: {
      'accept-ranges': 'bytes',
      'content-length': String(stats.size),
      'content-type': contentType,
    },
  };
}

export function renderHtmlErrorPage(params: {
  title: string;
  message: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      background: linear-gradient(180deg, #f8fbff 0%, #f4f7fb 100%);
      color: #1a2740;
    }
    main {
      max-width: 780px;
      margin: 72px auto;
      padding: 0 24px;
    }
    section {
      background: #ffffff;
      border: 1px solid #d7dfeb;
      border-radius: 18px;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      padding: 28px 32px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }
    p {
      margin: 0;
      color: #61728b;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>${escapeHtml(params.title)}</h1>
      <p>${escapeHtml(params.message)}</p>
    </section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseByteRange(
  rangeHeader: string | null | undefined,
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
      throw new ArtifactRangeNotSatisfiableError(totalSize);
    }
    const start = Math.max(0, totalSize - suffixLength);
    return {
      start,
      end: totalSize - 1,
    };
  }

  const start = parseInt(startValue, 10);
  const requestedEnd = endValue === '' ? totalSize - 1 : parseInt(endValue, 10);
  if (!Number.isFinite(start) || !Number.isFinite(requestedEnd)) {
    throw new ArtifactRangeNotSatisfiableError(totalSize);
  }
  if (start < 0 || start >= totalSize) {
    throw new ArtifactRangeNotSatisfiableError(totalSize);
  }

  const end = Math.min(requestedEnd, totalSize - 1);
  if (end < start) {
    throw new ArtifactRangeNotSatisfiableError(totalSize);
  }

  return { start, end };
}
