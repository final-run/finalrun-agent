import type { TestResult, TestStatus, FirstFailure } from './TestResult.js';
import type { TestDefinition } from './TestDefinition.js';
import type { SuiteDefinition } from './SuiteDefinition.js';
import type { AppConfig, VariableValue, SecretReference } from './Environment.js';

export type RunStatus = 'success' | 'failure' | 'aborted';
export type FailurePhase = 'validation' | 'setup' | 'execution' | 'finalization';

export interface RunTarget {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
}

export interface EnvironmentRecord {
  envName: string;
  workspaceEnvPath?: string;
  snapshotYamlPath?: string;
  snapshotJsonPath?: string;
  app?: AppConfig;
  variables: Record<string, VariableValue>;
  secretReferences: SecretReference[];
}

export interface RunManifestAppRecord {
  source: 'repo' | 'override' | 'config';
  label: string;
  identifier?: string;
  identifierKind?: 'packageName' | 'bundleId';
  name?: string;
  sourceEnvName?: string;
  overridePath?: string;
}

export interface RunSummary {
  runId: string;
  envName: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  status: RunStatus;
  failurePhase?: FailurePhase;
  testCount: number;
  passedCount: number;
  failedCount: number;
  stepCount?: number;
  target?: RunTarget;
  variables: Record<string, VariableValue>;
  tests: Array<{
    testId: string;
    testName: string;
    relativePath: string;
    success: boolean;
    status: TestStatus;
    durationMs: number;
    resultFile: string;
  }>;
  runJsonFile?: string;
}

export interface RunManifest {
  schemaVersion: 2 | 3;
  run: {
    runId: string;
    success: boolean;
    status: RunStatus;
    failurePhase?: FailurePhase;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    envName: string;
    platform: string;
    model: {
      provider: string;
      modelName: string;
      label: string;
    };
    app: RunManifestAppRecord;
    selectors: string[];
    target?: RunTarget;
    counts: {
      tests: { total: number; passed: number; failed: number };
      steps: { total: number; passed: number; failed: number };
    };
    firstFailure?: FirstFailure;
    diagnosticsSummary?: string;
  };
  input: {
    environment: EnvironmentRecord;
    suite?: SuiteDefinition;
    tests: TestDefinition[];
    cli: {
      command: string;
      selectors: string[];
      suitePath?: string;
      requestedPlatform?: string;
      appOverridePath?: string;
      debug: boolean;
      maxIterations?: number;
    };
  };
  tests: TestResult[];
  paths: {
    runJson: string;
    summaryJson: string;
    log: string;
    runContextJson?: string;
  };
  /**
   * Multi-device run metadata. Only present when the run executed against a
   * multi-device workspace. Single-device runs omit this field so the emitted
   * JSON remains byte-identical to the pre-change baseline.
   */
  multiDevice?: {
    devices: Record<
      string,
      {
        platform: string;
        app?: string;
        hardwareName: string;
      }
    >;
  };
}
