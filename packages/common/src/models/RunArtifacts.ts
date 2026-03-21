import type { RepoVariableValue } from './RepoEnvironment.js';

export interface PlannerThoughtRecord {
  plan?: string;
  think?: string;
  act?: string;
}

export interface ActionPayloadRecord {
  text?: string;
  url?: string;
  direction?: string;
  clearText?: boolean;
  durationSeconds?: number;
  repeat?: number;
  delayBetweenTapMs?: number;
}

export interface ArtifactTraceSpan {
  name: string;
  startMs: number;
  durationMs: number;
  status: 'success' | 'failure';
  detail?: string;
}

export interface ArtifactStepTrace {
  step: number;
  action: string;
  status: 'success' | 'failure';
  totalMs: number;
  spans: ArtifactTraceSpan[];
  failureReason?: string;
}

export interface ArtifactTimingMetadata {
  totalMs: number;
  spans: Array<{
    name: string;
    durationMs: number;
    status: 'success' | 'failure';
    detail?: string;
  }>;
}

export interface StepArtifactRecord {
  stepNumber: number;
  iteration: number;
  actionType: string;
  naturalLanguageAction: string;
  reason: string;
  analysis?: string;
  thought?: PlannerThoughtRecord;
  actionPayload?: ActionPayloadRecord;
  success: boolean;
  status: 'success' | 'failure';
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
  screenshotFile?: string;
  videoOffsetMs?: number;
  stepJsonFile?: string;
  trace?: ArtifactStepTrace;
  timing?: ArtifactTimingMetadata;
}

export interface SpecArtifactRecord {
  specId: string;
  specName: string;
  sourcePath: string;
  relativePath: string;
  success: boolean;
  message: string;
  analysis?: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordingFile?: string;
  recordingStartedAt?: string;
  recordingCompletedAt?: string;
  steps: StepArtifactRecord[];
}

export interface RunSummaryRecord {
  runId: string;
  envName: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  specCount: number;
  passedCount: number;
  failedCount: number;
  variables: Record<string, RepoVariableValue>;
  tests: Array<{
    specId: string;
    specName: string;
    relativePath: string;
    success: boolean;
    durationMs: number;
    resultFile: string;
  }>;
}
