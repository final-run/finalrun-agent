import type { RepoTestSpec } from './RepoTestSpec.js';

export interface PlannerThoughtRecord {
  plan?: string;
  think?: string;
  act?: string;
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

export type StepArtifactStatus = 'success' | 'failure';
export type SpecArtifactStatus = 'success' | 'failure' | 'error' | 'aborted';
export type RunArtifactStatus = 'success' | 'failure' | 'aborted';

export interface StepArtifactRecord {
  stepNumber: number;
  actionType: string;
  naturalLanguageAction: string;
  reason: string;
  analysis?: string;
  thought?: PlannerThoughtRecord;
  success: boolean;
  status: StepArtifactStatus;
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
  screenshotFile?: string;
  videoOffsetMs?: number;
  stepJsonFile?: string;
  trace?: ArtifactStepTrace;
}

export interface SpecArtifactRecord {
  specId: string;
  specName: string;
  relativePath: string;
  success: boolean;
  status: SpecArtifactStatus;
  message: string;
  analysis?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordingFile?: string;
  steps: StepArtifactRecord[];
}

export interface RunTargetRecord {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
}

export interface ReportServerStateRecord {
  pid: number;
  port: number;
  url: string;
  workspaceRoot: string;
  artifactsDir: string;
  mode: 'production' | 'development';
  startedAt: string;
}

export interface RunSummaryRecord {
  runId: string;
  envName: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  status: RunArtifactStatus;
  failurePhase?: FailurePhase;
  specCount: number;
  passedCount: number;
  failedCount: number;
  stepCount?: number;
  target?: RunTargetRecord;
  variables: Record<string, unknown>;
  tests: Array<{
    specId: string;
    specName: string;
    relativePath: string;
    success: boolean;
    status: SpecArtifactStatus;
    durationMs: number;
    resultFile: string;
  }>;
  runJsonFile?: string;
}

export type FailurePhase = 'validation' | 'setup' | 'execution' | 'finalization';

export interface BindingReferenceRecord {
  variables: string[];
  secrets: string[];
}

export interface RunManifestAuthoredRefRecord {
  section: 'setup' | 'steps' | 'assertions';
  index: number;
}

export interface RunManifestFirstFailureRecord {
  specId?: string;
  specName?: string;
  stepNumber?: number;
  actionType?: string;
  message: string;
  screenshotPath?: string;
  stepJsonPath?: string;
}

export interface RunManifestStepRecord extends StepArtifactRecord {
  authoredRef?: RunManifestAuthoredRefRecord;
}

export interface RunManifestSpecRecord extends SpecArtifactRecord {
  workspaceSourcePath: string;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  bindingReferences: BindingReferenceRecord;
  authored: RepoTestSpec;
  firstFailure?: RunManifestFirstFailureRecord;
  previewScreenshotPath?: string;
  resultJsonPath: string;
  steps: RunManifestStepRecord[];
}

export interface RunManifestEnvironmentRecord {
  envName: string;
}

export interface RunManifestSuiteRecord {
  suiteId: string;
  suiteName: string;
  description?: string;
  workspaceSourcePath: string;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  tests: string[];
  resolvedSpecIds: string[];
}

export interface RunManifestSelectedSpecRecord {
  specId: string;
  specName: string;
  relativePath: string;
  workspaceSourcePath: string;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  bindingReferences: BindingReferenceRecord;
}

export interface RunManifestModelRecord {
  provider: string;
  modelName: string;
  label: string;
}

export interface RunManifestAppRecord {
  source: 'repo' | 'override';
  label: string;
  overridePath?: string;
}

export interface RunManifestRecord {
  schemaVersion: 1;
  run: {
    runId: string;
    command: string;
    success: boolean;
    status: RunArtifactStatus;
    failurePhase?: FailurePhase;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    envName: string;
    platform: string;
    model: RunManifestModelRecord;
    app: RunManifestAppRecord;
    tagFilter: string | null;
    target?: RunTargetRecord;
    totalTests: number;
    completedTests: number;
    firstFailure?: RunManifestFirstFailureRecord;
    diagnosticsSummary?: string;
  };
  input: {
    environment: RunManifestEnvironmentRecord;
    suite?: RunManifestSuiteRecord;
    specs: RunManifestSelectedSpecRecord[];
  };
  specs: RunManifestSpecRecord[];
  paths: {
    runJson: string;
    summaryJson: string;
    log: string;
    runContextJson?: string;
  };
}

export interface RunIndexEntryRecord {
  runId: string;
  command: string;
  success: boolean;
  status: RunArtifactStatus;
  failurePhase?: FailurePhase;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  envName: string;
  platform: string;
  modelLabel: string;
  appLabel: string;
  target?: RunTargetRecord;
  totalTests: number;
  completedTests: number;
  passedCount: number;
  failedCount: number;
  firstFailure?: RunManifestFirstFailureRecord;
  previewScreenshotPath?: string;
}

export interface RunIndexRecord {
  schemaVersion: 1;
  generatedAt: string;
  runs: RunIndexEntryRecord[];
}
