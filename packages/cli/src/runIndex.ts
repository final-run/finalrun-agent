import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { RunIndexEntryRecord, RunIndexRecord, RunManifestRecord } from '@finalrun/common';

export async function rebuildRunIndex(
  artifactsDir: string,
): Promise<RunIndexRecord> {
  await fsp.mkdir(artifactsDir, { recursive: true });
  const entries = await fsp.readdir(artifactsDir, { withFileTypes: true });
  const runs: RunIndexEntryRecord[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runId = entry.name;
    const runJsonPath = path.join(artifactsDir, runId, 'run.json');
    let manifest: RunManifestRecord;
    try {
      const raw = await fsp.readFile(runJsonPath, 'utf-8');
      manifest = JSON.parse(raw) as RunManifestRecord;
    } catch {
      continue;
    }

    const target = manifest.run.target ?? {
      type: 'direct' as const,
    };
    runs.push({
      runId: manifest.run.runId,
      success: manifest.run.success,
      status: manifest.run.status,
      failurePhase: manifest.run.failurePhase,
      startedAt: manifest.run.startedAt,
      completedAt: manifest.run.completedAt,
      durationMs: manifest.run.durationMs,
      envName: manifest.run.envName,
      platform: manifest.run.platform,
      modelLabel: manifest.run.model.label,
      appLabel: manifest.run.app.label,
      target,
      specCount: manifest.run.counts.specs.total,
      passedCount: manifest.run.counts.specs.passed,
      failedCount: manifest.run.counts.specs.failed,
      stepCount: manifest.run.counts.steps.total,
      firstFailure: manifest.run.firstFailure,
      previewScreenshotPath: manifest.run.firstFailure?.screenshotPath
        ? path.posix.join(runId, manifest.run.firstFailure.screenshotPath)
        : undefined,
      paths: {
        runJson: path.posix.join(runId, manifest.paths.runJson),
        log: path.posix.join(runId, manifest.paths.log),
      },
    });
  }

  runs.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const index: RunIndexRecord = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runs,
  };

  await fsp.writeFile(
    path.join(artifactsDir, 'runs.json'),
    JSON.stringify(index, null, 2),
    'utf-8',
  );
  return index;
}

export async function loadRunIndex(
  artifactsDir: string,
): Promise<RunIndexRecord> {
  try {
    const raw = await fsp.readFile(path.join(artifactsDir, 'runs.json'), 'utf-8');
    return JSON.parse(raw) as RunIndexRecord;
  } catch {
    return rebuildRunIndex(artifactsDir);
  }
}

export function formatRunIndexForConsole(index: RunIndexRecord): string {
  if (index.runs.length === 0) {
    return 'No FinalRun reports found.';
  }

  const lines = ['Status  Env       Platform  Specs     Duration  Run ID'];
  for (const run of index.runs) {
    lines.push(
      `${pad(resolveRunStatusLabel(run), 6)}  ${pad(run.envName, 8)}  ${pad(run.platform, 8)}  ${pad(`${run.passedCount}/${run.specCount}`, 8)}  ${pad(formatDuration(run.durationMs), 8)}  ${run.runId}`,
    );
  }
  return lines.join('\n');
}

function resolveRunStatusLabel(
  run: Pick<RunIndexEntryRecord, 'status' | 'success'>,
): 'PASS' | 'FAIL' | 'ABORT' {
  if (run.status === 'aborted') {
    return 'ABORT';
  }
  return run.success ? 'PASS' : 'FAIL';
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${' '.repeat(width - value.length)}`;
}

function formatDuration(durationMs: number): string {
  const seconds = Number(durationMs || 0) / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}
