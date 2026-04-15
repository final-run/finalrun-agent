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
  authoredRef?: { section: 'setup' | 'steps' | 'expected_state'; index: number };
  /**
   * Device key this action was dispatched to in a multi-device run (e.g. `"alice"`, `"bob"`).
   * Omitted for single-device runs so JSON output remains byte-identical.
   */
  device?: string;
}

/**
 * Per-device artifact paths for multi-device runs. All paths are relative to
 * the run root; each device has its own video/log streams captured in parallel.
 */
export interface PerDeviceArtifact {
  /** Subfolder under `tests/{testId}/` scoped to this device (e.g. `alice`). */
  folder: string;
  /** Recording (mp4/mov) captured on this device. */
  recordingFile?: string;
  /** Device log tail captured on this device. */
  deviceLogFile?: string;
  /** ISO timestamp when recording started on this device (for scrubber anchoring). */
  recordingStartedAt?: string;
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
  /**
   * Discriminator flagging a multi-device test run. Single-device runs omit
   * this field so JSON output remains byte-identical to the pre-change baseline.
   */
  multiDevice?: boolean;
  /**
   * Per-device artifact paths (folder, recording, device log, anchor timestamp),
   * keyed by device identifier (e.g. `"alice"`, `"bob"`). Only present when
   * `multiDevice` is true.
   */
  perDeviceArtifacts?: Record<string, PerDeviceArtifact>;
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
