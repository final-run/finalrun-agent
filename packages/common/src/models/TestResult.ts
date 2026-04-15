import type { TestDefinition, BindingReference } from './TestDefinition.js';
import type { AgentActionTrace, TimingInfo } from './Trace.js';

export interface PlannerThought {
  plan?: string;
  think?: string;
  act?: string;
}

export interface ActionPayload {
  text?: string;
  url?: string;
  direction?: string;
  clearText?: boolean;
  durationSeconds?: number;
  repeat?: number;
  delayBetweenTapMs?: number;
}

export type AgentActionStatus = 'success' | 'failure';
export type TestStatus = 'success' | 'failure' | 'error' | 'aborted';

export interface AgentAction {
  stepNumber: number;
  iteration: number;
  actionType: string;
  naturalLanguageAction: string;
  reason: string;
  analysis?: string;
  thought?: PlannerThought;
  actionPayload?: ActionPayload;
  success: boolean;
  status: AgentActionStatus;
  errorMessage?: string;
  durationMs?: number;
  timestamp: string;
  screenshotFile?: string;
  videoOffsetMs?: number;
  stepJsonFile?: string;
  trace?: AgentActionTrace;
  timing?: TimingInfo;
  authoredRef?: { section: 'steps' | 'expected_state'; index: number };
}

export interface TestResult {
  testId: string;
  testName: string;
  sourcePath: string;
  relativePath: string;
  success: boolean;
  status: TestStatus;
  message: string;
  analysis?: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordingFile?: string;
  recordingStartedAt?: string;
  recordingCompletedAt?: string;
  deviceLogFile?: string;
  deviceLogStartedAt?: string;
  deviceLogCompletedAt?: string;
  steps: AgentAction[];
  workspaceSourcePath?: string;
  snapshotYamlPath?: string;
  snapshotJsonPath?: string;
  bindingReferences?: BindingReference;
  authored?: TestDefinition;
  effectiveGoal?: string;
  counts?: {
    executionStepsTotal: number;
    executionStepsPassed: number;
    executionStepsFailed: number;
  };
  firstFailure?: FirstFailure;
  previewScreenshotPath?: string;
  resultJsonPath?: string;
}

export interface FirstFailure {
  testId?: string;
  testName?: string;
  stepNumber?: number;
  actionType?: string;
  message: string;
  screenshotPath?: string;
  stepJsonPath?: string;
}
