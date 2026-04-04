import type { RunStatus, FailurePhase, RunTarget } from './RunManifest.js';
import type { FirstFailure } from './TestResult.js';

export interface ReportServerState {
  pid: number;
  port: number;
  url: string;
  workspaceRoot: string;
  artifactsDir: string;
  mode: 'production' | 'development';
  startedAt: string;
}

export interface RunIndexEntry {
  runId: string;
  success: boolean;
  status: RunStatus;
  failurePhase?: FailurePhase;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  envName: string;
  platform: string;
  modelLabel: string;
  appLabel: string;
  target?: RunTarget;
  testCount: number;
  passedCount: number;
  failedCount: number;
  stepCount: number;
  firstFailure?: FirstFailure;
  previewScreenshotPath?: string;
  paths: {
    runJson: string;
    log: string;
  };
}

export interface RunIndex {
  schemaVersion: 1;
  generatedAt: string;
  runs: RunIndexEntry[];
}
