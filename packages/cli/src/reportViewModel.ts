// View-model loaders for the local report.
//
// Returns objects whose artifact paths stay workspace-relative (NOT rewritten
// to HTTP URLs). The React components in @finalrun/report-web/ui do URL
// rewriting via their own buildArtifactRoute() helper, so the JSON served on
// /api/report/* matches exactly what the components expect.
//
// Type shapes mirror packages/report-web/src/artifacts.ts. Keep them aligned
// if either side changes.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type {
  RunIndex,
  RunIndexEntry,
  RunManifest,
  TestDefinition,
  TestResult,
} from '@finalrun/common';
import { loadRunIndex } from './runIndex.js';

const MISSING_WORKSPACE_CONFIG_ERROR =
  'The FinalRun report server is missing workspace configuration. Start it with `finalrun start-server`.';

export interface ReportWorkspaceContext {
  workspaceRoot: string;
  artifactsDir: string;
}

export interface ReportIndexRunRecord extends RunIndexEntry {
  displayName: string;
  displayKind: 'suite' | 'single_test' | 'multi_test' | 'fallback';
  triggeredFrom: 'Suite' | 'Direct';
  selectedTestCount: number;
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

export interface ReportManifestSelectedTestRecord extends TestDefinition {
  snapshotYamlText?: string;
}

export interface ReportManifestTestRecord extends TestResult {
  snapshotYamlText?: string;
  deviceLogTailText?: string;
}

export interface ReportRunManifest extends Omit<RunManifest, 'input' | 'tests'> {
  input: Omit<RunManifest['input'], 'tests'> & {
    tests: ReportManifestSelectedTestRecord[];
  };
  tests: ReportManifestTestRecord[];
}

export function resolveReportWorkspaceContext(): ReportWorkspaceContext {
  const workspaceRoot = process.env.FINALRUN_REPORT_WORKSPACE_ROOT;
  const artifactsDir = process.env.FINALRUN_REPORT_ARTIFACTS_DIR;
  if (!workspaceRoot || !artifactsDir) {
    throw new Error(MISSING_WORKSPACE_CONFIG_ERROR);
  }
  return { workspaceRoot, artifactsDir };
}

export async function loadReportIndexViewModel(
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<ReportIndexViewModel> {
  const index: RunIndex = await loadRunIndex(context.artifactsDir);
  const runs = await Promise.all(
    index.runs.map((run) => enrichRunIndexEntry(run, context)),
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
): Promise<RunManifest> {
  const runJsonPath = path.join(context.artifactsDir, runId, 'run.json');
  const raw = await fsp.readFile(runJsonPath, 'utf-8');
  const parsed = JSON.parse(raw) as RunManifest;
  if (parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) {
    throw new Error(`Unsupported schema version: ${parsed.schemaVersion}`);
  }
  return parsed;
}

export async function loadReportRunManifestViewModel(
  runId: string,
  context: ReportWorkspaceContext = resolveReportWorkspaceContext(),
): Promise<ReportRunManifest> {
  return enrichRunManifestRecord(await loadRunManifestRecord(runId, context), context);
}

async function enrichRunManifestRecord(
  manifest: RunManifest,
  context: ReportWorkspaceContext,
): Promise<ReportRunManifest> {
  const runId = manifest.run.runId;
  const snapshotCache = new Map<string, Promise<string | undefined>>();
  const readSnapshotYamlText = async (snapshotYamlPath: string | undefined): Promise<string | undefined> => {
    if (!snapshotYamlPath) return undefined;
    let cached = snapshotCache.get(snapshotYamlPath);
    if (!cached) {
      cached = readRunArtifactText(context, runId, snapshotYamlPath);
      snapshotCache.set(snapshotYamlPath, cached);
    }
    return cached;
  };

  const readDeviceLogTail = async (deviceLogPath: string | undefined): Promise<string | undefined> => {
    if (!deviceLogPath) return undefined;
    const content = await readRunArtifactText(context, runId, deviceLogPath);
    if (!content) return undefined;
    const lines = content.split('\n');
    const maxLines = 500;
    if (lines.length > maxLines) {
      return `[… ${lines.length - maxLines} lines truncated]\n${lines.slice(-maxLines).join('\n')}`;
    }
    return content;
  };

  return {
    ...manifest,
    input: {
      ...manifest.input,
      tests: await Promise.all(
        manifest.input.tests.map(async (t) => ({
          ...t,
          snapshotYamlText: await readSnapshotYamlText(t.snapshotYamlPath),
        })),
      ),
    },
    tests: await Promise.all(
      manifest.tests.map(async (t) => ({
        ...t,
        snapshotYamlText: await readSnapshotYamlText(t.snapshotYamlPath),
        deviceLogTailText: await readDeviceLogTail(t.deviceLogFile),
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
  if (!normalizedPath) return undefined;

  try {
    return await fsp.readFile(path.join(context.artifactsDir, runId, normalizedPath), 'utf-8');
  } catch {
    return undefined;
  }
}

function normalizeRunArtifactPath(runId: string, artifactPath: string): string | undefined {
  const normalized = artifactPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.length === 0) return undefined;
  if (!normalized.startsWith('artifacts/')) return normalized;

  const withoutArtifactsPrefix = normalized.slice('artifacts/'.length);
  if (withoutArtifactsPrefix.startsWith(`${runId}/`)) {
    return withoutArtifactsPrefix.slice(runId.length + 1);
  }
  return undefined;
}

async function enrichRunIndexEntry(
  run: RunIndexEntry,
  context: ReportWorkspaceContext,
): Promise<ReportIndexRunRecord> {
  const manifest = await loadRunManifestRecord(run.runId, context).catch(() => null);
  const selectedTests = manifest?.input.tests ?? [];

  return {
    ...run,
    displayName: deriveRunDisplayName(run, manifest),
    displayKind: deriveRunDisplayKind(run, manifest),
    triggeredFrom: run.target?.type === 'suite' ? 'Suite' : 'Direct',
    selectedTestCount: selectedTests.length > 0 ? selectedTests.length : run.testCount,
  };
}

function deriveRunDisplayName(
  run: RunIndexEntry,
  manifest: RunManifest | null,
): string {
  if (run.target?.type === 'suite' && run.target.suiteName) {
    return run.target.suiteName;
  }

  const selectedTests = manifest?.input.tests ?? [];
  if (selectedTests.length === 1) {
    return selectedTests[0]?.name || selectedTests[0]?.relativePath || run.runId;
  }
  if (selectedTests.length > 1) {
    const firstLabel =
      selectedTests[0]?.name || selectedTests[0]?.relativePath || 'Selected tests';
    return `${firstLabel} +${selectedTests.length - 1} more`;
  }

  return run.runId;
}

function deriveRunDisplayKind(
  run: RunIndexEntry,
  manifest: RunManifest | null,
): ReportIndexRunRecord['displayKind'] {
  if (run.target?.type === 'suite') return 'suite';

  const selectedCount = manifest?.input.tests?.length ?? run.testCount;
  if (selectedCount === 1) return 'single_test';
  if (selectedCount > 1) return 'multi_test';
  return 'fallback';
}
