import type {
  RepoVariableValue,
  SecretReference,
} from './RepoEnvironment.js';
import type { RepoTestSpec } from './RepoTestSpec.js';

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

export interface RunTargetRecord {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
}

export interface RunSummaryRecord {
  runId: string;
  envName: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  failurePhase?: FailurePhase;
  specCount: number;
  passedCount: number;
  failedCount: number;
  stepCount?: number;
  target?: RunTargetRecord;
  variables: Record<string, RepoVariableValue>;
  tests: Array<{
    specId: string;
    specName: string;
    relativePath: string;
    success: boolean;
    durationMs: number;
    resultFile: string;
  }>;
  runJsonFile?: string;
  indexFile?: string;
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
  effectiveGoal: string;
  counts: {
    executionStepsTotal: number;
    executionStepsPassed: number;
    executionStepsFailed: number;
  };
  firstFailure?: RunManifestFirstFailureRecord;
  previewScreenshotPath?: string;
  resultJsonPath: string;
  steps: RunManifestStepRecord[];
}

export interface RunManifestEnvironmentRecord {
  envName: string;
  workspaceEnvPath?: string;
  snapshotYamlPath?: string;
  snapshotJsonPath?: string;
  variables: Record<string, RepoVariableValue>;
  secretReferences: SecretReference[];
}

export interface RunManifestSuiteRecord {
  suiteId: string;
  suiteName: string;
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

export interface RunManifestCliRecord {
  command: string;
  selectors: string[];
  suitePath?: string;
  requestedPlatform?: string;
  appOverridePath?: string;
  debug: boolean;
  maxIterations?: number;
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

export interface RunManifestCountRecord {
  total: number;
  passed: number;
  failed: number;
}

export interface RunManifestRecord {
  schemaVersion: 1;
  run: {
    runId: string;
    success: boolean;
    status: 'success' | 'failure';
    failurePhase?: FailurePhase;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    envName: string;
    platform: string;
    model: RunManifestModelRecord;
    app: RunManifestAppRecord;
    selectors: string[];
    target?: RunTargetRecord;
    counts: {
      specs: RunManifestCountRecord;
      steps: RunManifestCountRecord;
    };
    firstFailure?: RunManifestFirstFailureRecord;
    diagnosticsSummary?: string;
  };
  input: {
    environment: RunManifestEnvironmentRecord;
    suite?: RunManifestSuiteRecord;
    specs: RunManifestSelectedSpecRecord[];
    cli: RunManifestCliRecord;
  };
  specs: RunManifestSpecRecord[];
  paths: {
    html: string;
    runJson: string;
    summaryJson: string;
    log: string;
    runContextJson?: string;
  };
}

export interface RunIndexEntryRecord {
  runId: string;
  success: boolean;
  status: 'success' | 'failure';
  failurePhase?: FailurePhase;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  envName: string;
  platform: string;
  modelLabel: string;
  appLabel: string;
  target?: RunTargetRecord;
  specCount: number;
  passedCount: number;
  failedCount: number;
  stepCount: number;
  firstFailure?: RunManifestFirstFailureRecord;
  previewScreenshotPath?: string;
  paths: {
    html: string;
    runJson: string;
    log: string;
  };
}

export interface RunIndexRecord {
  schemaVersion: 1;
  generatedAt: string;
  runs: RunIndexEntryRecord[];
}
