import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import type {
  RunIndexEntryRecord,
  RunIndexRecord,
  RunManifestRecord as SharedRunManifestRecord,
  RunManifestSelectedSpecRecord,
  RunManifestSpecRecord,
} from '@finalrun/common';
import { REPORT_CONTENT_TYPES } from './contentTypes';

const MISSING_WORKSPACE_CONFIG_ERROR =
  'The FinalRun report server is missing workspace configuration. Start it with `finalrun start-server`.';

export interface ReportWorkspaceContext {
  workspaceRoot: string;
  artifactsDir: string;
}

export interface ReportIndexRunRecord extends RunIndexEntryRecord {
  displayName: string;
  displayKind: 'suite' | 'single_spec' | 'multi_spec' | 'fallback';
  triggeredFrom: 'Suite' | 'Direct';
  selectedSpecCount: number;
}

export interface ReportIndexViewModel {
  generatedAt: string;
  summary: {
    totalRuns: number;
    totalSuccessRate: number;
    totalDurationMs: number;
  };
  runs: ReportIndexRunRecord[];
}

export interface ReportManifestSelectedSpecRecord extends RunManifestSelectedSpecRecord {
  snapshotYamlText?: string;
}

export interface ReportManifestSpecRecord extends RunManifestSpecRecord {
  snapshotYamlText?: string;
}

export interface ReportRunManifestRecord extends Omit<SharedRunManifestRecord, 'input' | 'specs'> {
  input: Omit<SharedRunManifestRecord['input'], 'specs'> & {
    specs: ReportManifestSelectedSpecRecord[];
  };
  specs: ReportManifestSpecRecord[];
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

export async function loadReportIndexViewModel(
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<ReportIndexViewModel> {
  const index = await loadRunIndexRecord(context);
  const runs = await Promise.all(
    index.runs.map(async (run) => await enrichRunIndexEntry(run, context)),
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

export async function loadRunManifestRecord(
  runId: string,
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<SharedRunManifestRecord> {
  const runJsonPath = path.join(context.artifactsDir, runId, 'run.json');
  const raw = await fsp.readFile(runJsonPath, 'utf-8');
  return JSON.parse(raw) as SharedRunManifestRecord;
}

export async function loadReportRunManifestViewModel(
  runId: string,
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<ReportRunManifestRecord> {
  return await enrichRunManifestRecord(await loadRunManifestRecord(runId, context), context);
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

async function enrichRunManifestRecord(
  manifest: SharedRunManifestRecord,
  context: ReportWorkspaceContext,
): Promise<ReportRunManifestRecord> {
  const runId = manifest.run.runId;
  const snapshotCache = new Map<string, Promise<string | undefined>>();
  const readSnapshotYamlText = async (snapshotYamlPath: string): Promise<string | undefined> => {
    let cached = snapshotCache.get(snapshotYamlPath);
    if (!cached) {
      cached = readRunArtifactText(context, runId, snapshotYamlPath);
      snapshotCache.set(snapshotYamlPath, cached);
    }
    return await cached;
  };

  return {
    ...manifest,
    input: {
      ...manifest.input,
      specs: await Promise.all(
        manifest.input.specs.map(async (spec) => ({
          ...spec,
          snapshotYamlText: await readSnapshotYamlText(spec.snapshotYamlPath),
        })),
      ),
    },
    specs: await Promise.all(
      manifest.specs.map(async (spec) => ({
        ...spec,
        snapshotYamlText: await readSnapshotYamlText(spec.snapshotYamlPath),
      })),
    ),
  };
}

async function readRunArtifactText(
  context: ReportWorkspaceContext,
  runId: string,
  artifactPath: string,
): Promise<string | undefined> {
  const normalizedPath = normalizeRunArtifactPath(runId, artifactPath);
  if (!normalizedPath) {
    return undefined;
  }

  try {
    return await fsp.readFile(path.join(context.artifactsDir, runId, normalizedPath), 'utf-8');
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
  context: ReportWorkspaceContext,
): Promise<ReportIndexRunRecord> {
  const manifest = await loadRunManifestRecord(run.runId, context).catch(() => null);
  const selectedSpecs = manifest?.input.specs ?? [];

  return {
    ...run,
    displayName: deriveRunDisplayName(run, manifest),
    displayKind: deriveRunDisplayKind(run, manifest),
    triggeredFrom: run.target?.type === 'suite' ? 'Suite' : 'Direct',
    selectedSpecCount: selectedSpecs.length > 0 ? selectedSpecs.length : run.specCount,
  };
}

function deriveRunDisplayName(
  run: RunIndexEntryRecord,
  manifest: SharedRunManifestRecord | null,
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
  manifest: SharedRunManifestRecord | null,
): ReportIndexRunRecord['displayKind'] {
  if (run.target?.type === 'suite') {
    return 'suite';
  }

  const selectedCount = manifest?.input.specs.length ?? run.specCount;
  if (selectedCount === 1) {
    return 'single_spec';
  }
  if (selectedCount > 1) {
    return 'multi_spec';
  }

  return 'fallback';
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
