// The main loop: screenshot → plan → act → repeat.

import { v4 as uuidv4 } from 'uuid';
import {
  DeviceAgent,
  DeviceActionRequest,
  Hierarchy,
  Logger,
  GetScreenshotAndHierarchyAction,
  DEFAULT_MAX_ITERATIONS,
  PLANNER_ACTION_COMPLETED,
  PLANNER_ACTION_FAILED,
  type ActionPayload,
  type PlannerThought,
  type RuntimeBindings,
} from '@finalrun/common';
import { AIAgent, PlannerResponse } from './ai/AIAgent.js';
import {
  type TerminalFailureSignal,
  terminalFailureFromError,
} from './ai/providerFailure.js';
import { ActionExecutor } from './ActionExecutor.js';
import {
  StepTraceBuilder,
  formatStepTraceSummary,
  startTracePhase,
  type SpanTiming,
  type StepTrace,
  type TimingMetadata,
} from './trace.js';

// ============================================================================
// Types
// ============================================================================

export interface TestExecutorConfig {
  goal: string;
  platform: string;
  maxIterations?: number;
  agent: DeviceAgent;
  aiAgent: AIAgent;
  preContext?: string;
  appKnowledge?: string;
  appIdentifier?: string;
  runtimeBindings?: RuntimeBindings;
}

export interface AgentActionResult {
  iteration: number;
  action: string;
  reason: string;
  naturalLanguageAction?: string;
  analysis?: string;
  thought?: PlannerThought;
  actionPayload?: ActionPayload;
  success: boolean;
  errorMessage?: string;
  screenshot?: string;
  screenWidth?: number;
  screenHeight?: number;
  timestamp?: string;
  durationMs?: number;
  timing?: TimingMetadata;
  trace?: StepTrace;
}

export interface TestRecordingResult {
  filePath: string;
  startedAt: string;
  completedAt?: string;
}

export type ExecutionStatus = 'success' | 'failure' | 'aborted';

export interface TestExecutionResult {
  success: boolean;
  status: ExecutionStatus;
  message: string;
  terminalFailure?: TerminalFailureSignal;
  analysis?: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  recording?: TestRecordingResult;
  steps: AgentActionResult[];
  totalIterations: number;
}

/**
 * Progress callback — called on each iteration.
 * Used by the CLI's terminal renderer to show live progress.
 */
export type ExecutionProgressCallback = (event: ExecutionProgressEvent) => void;

export interface ExecutionProgressEvent {
  type: 'planning' | 'executing' | 'step_complete' | 'goal_complete' | 'error';
  iteration: number;
  totalIterations: number;
  status?: ExecutionStatus;
  action?: string;
  reason?: string;
  success?: boolean;
  message?: string;
}

interface DeviceState {
  screenshot: string;
  hierarchy: Hierarchy;
  screenWidth: number;
  screenHeight: number;
}

interface CaptureTraceMetadata {
  totalMs: number;
  stabilityMs?: number;
  finalPayloadMs: number;
  stable: boolean;
  pollCount: number;
  attempts: number;
  failureReason?: string;
}

interface PostActionCaptureResult {
  status: 'success' | 'transient' | 'fatal';
  screenshot?: string;
  screenWidth?: number;
  screenHeight?: number;
  captureTrace?: CaptureTraceMetadata;
  message?: string;
}

type DeviceStateCaptureResult =
  | {
      status: 'success';
      deviceState: DeviceState;
      captureTrace?: CaptureTraceMetadata;
    }
  | {
      status: 'transient' | 'fatal';
      message: string;
      captureTrace?: CaptureTraceMetadata;
    };

const MAX_CONSECUTIVE_TRANSIENT_CAPTURE_FAILURES = 2;

// ============================================================================
// TestExecutor
// ============================================================================

/**
 * Orchestrates the full goal execution loop:
 *   1. Capture device state (screenshot + hierarchy)
 *   2. Call AI planner → get next action
 *   3. Execute action via ActionExecutor
 *   4. Record result, check for done/failure
 *   5. Repeat
 *
 */
export class TestExecutor {
  private _config: TestExecutorConfig;
  private _actionExecutor: ActionExecutor;
  private _aborted = false;
  private _steps: AgentActionResult[] = [];

  constructor(config: TestExecutorConfig) {
    this._config = config;
    this._actionExecutor = new ActionExecutor({
      agent: config.agent,
      aiAgent: config.aiAgent,
      platform: config.platform,
      appIdentifier: config.appIdentifier,
      runtimeBindings: config.runtimeBindings,
    });
  }

  /**
   * Abort the goal execution.
   * The loop will stop after the current iteration completes.
   */
  abort(): void {
    this._aborted = true;
    Logger.i('Goal execution aborted');
  }

  /**
   * Backward-compatible alias for abort().
   */
  cancel(): void {
    this.abort();
  }

  /**
   * Execute the goal. Main entry point.
   */
  async executeGoal(
    onProgress?: ExecutionProgressCallback,
  ): Promise<TestExecutionResult> {
    const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const startedAt = new Date().toISOString();
    let history = '';
    let remember: string[] = [];
    let consecutiveTransientCaptureFailures = 0;

    Logger.i(`Starting goal execution: "${this._config.goal}"`);
    Logger.i(`Max iterations: ${maxIterations}`);

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const stepTrace = new StepTraceBuilder(iteration);

      if (this._aborted) {
        return {
          success: false,
          status: 'aborted',
          message: 'Goal execution was aborted',
          platform: this._config.platform,
          startedAt,
          completedAt: new Date().toISOString(),
          steps: this._steps,
          totalIterations: iteration - 1,
        };
      }

      onProgress?.({
        type: 'planning',
        iteration,
        totalIterations: maxIterations,
        message: 'Capturing device state...',
      });

      const capturePhase = startTracePhase(iteration, 'capture.total');
      const captureResult = await this._captureDeviceState(iteration);
      const captureSpan = stepTrace.addSpanFromActivePhase(
        capturePhase,
        captureResult.status === 'success' ? 'success' : 'failure',
        captureResult.status === 'success' ? undefined : captureResult.message,
      );
      stepTrace.setAction('captureDeviceState');
      stepTrace.addSequentialTimings(
        this._captureTraceToTimings(captureResult.captureTrace),
        {
          startMs: captureSpan.startMs,
        },
      );

      if (captureResult.status !== 'success') {
        consecutiveTransientCaptureFailures += 1;
        stepTrace.markFailure(captureResult.message);
        const trace = this._emitTraceSummary(stepTrace);
        const captureStep: AgentActionResult = {
          iteration,
          action: 'captureDeviceState',
          reason: captureResult.message,
          naturalLanguageAction: 'Capture device state',
          success: false,
          errorMessage: captureResult.message,
          timestamp: new Date().toISOString(),
          durationMs: trace.totalMs,
          trace,
        };
        this._steps.push(captureStep);

        onProgress?.({
          type: 'error',
          iteration,
          totalIterations: maxIterations,
          message: captureResult.message,
        });

        if (captureResult.status === 'fatal') {
          return {
            success: false,
            status: 'failure',
            message: captureResult.message,
            platform: this._config.platform,
            startedAt,
            completedAt: new Date().toISOString(),
            steps: this._steps,
            totalIterations: iteration,
          };
        }

        Logger.w(
          `Transient device state capture failure (${consecutiveTransientCaptureFailures}/${MAX_CONSECUTIVE_TRANSIENT_CAPTURE_FAILURES}): ${captureResult.message}`,
        );
        if (
          consecutiveTransientCaptureFailures >=
          MAX_CONSECUTIVE_TRANSIENT_CAPTURE_FAILURES
        ) {
          return {
            success: false,
            status: 'failure',
            message: `Repeated transient device state capture failures: ${captureResult.message}`,
            platform: this._config.platform,
            startedAt,
            completedAt: new Date().toISOString(),
            steps: this._steps,
            totalIterations: iteration,
          };
        }

        continue;
      }

      consecutiveTransientCaptureFailures = 0;
      const deviceState = captureResult.deviceState;

      onProgress?.({
        type: 'planning',
        iteration,
        totalIterations: maxIterations,
        message: 'Thinking...',
      });

      const planningPhase = startTracePhase(iteration, 'planning.total');
      let plannerResponse: PlannerResponse;
      try {
        plannerResponse = await this._config.aiAgent.plan({
          testObjective: this._config.goal,
          platform: this._config.platform,
          preActionScreenshot: deviceState.screenshot,
          hierarchy: deviceState.hierarchy,
          history: history || undefined,
          remember: remember.length > 0 ? remember : undefined,
          preContext: this._config.preContext,
          appKnowledge: this._config.appKnowledge,
          traceStep: iteration,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const terminalFailure = terminalFailureFromError(error);
        Logger.e('Planner call failed:', error);
        const planningSpan = stepTrace.addSpanFromActivePhase(
          planningPhase,
          'failure',
          errorMsg,
        );
        stepTrace.setAction('plannerError');
        stepTrace.markFailure(errorMsg);
        stepTrace.addSequentialTimings(undefined, { startMs: planningSpan.startMs });
        const trace = this._emitTraceSummary(stepTrace);

        this._steps.push({
          iteration,
          action: 'plannerError',
          reason: errorMsg,
          naturalLanguageAction: 'Planner error',
          success: false,
          errorMessage: errorMsg,
          timestamp: new Date().toISOString(),
          durationMs: trace.totalMs,
          trace,
        });

        onProgress?.({
          type: 'error',
          iteration,
          totalIterations: maxIterations,
          message: `Planner error: ${errorMsg}`,
        });

        if (terminalFailure) {
          Logger.e(terminalFailure.message);
          return {
            success: false,
            status: 'failure',
            message: terminalFailure.message,
            terminalFailure,
            platform: this._config.platform,
            startedAt,
            completedAt: new Date().toISOString(),
            steps: this._steps,
            totalIterations: iteration,
          };
        }
        continue;
      }

      const planningSpan = stepTrace.addSpanFromActivePhase(planningPhase, 'success');
      stepTrace.addSequentialTimings(
        this._plannerTraceToTimings(plannerResponse),
        { startMs: planningSpan.startMs },
      );

      const action = plannerResponse.act;
      const reason = plannerResponse.reason;
      const naturalLanguageAction = plannerResponse.thought?.act ?? reason;

      Logger.i(`[${iteration}/${maxIterations}] \x1b[35mAction\x1b[0m: ${action} — ${reason}`);

      stepTrace.setAction(action);
      remember = plannerResponse.remember;

      if (action === PLANNER_ACTION_COMPLETED) {
        Logger.i('✓ Goal completed successfully!');
        const trace = this._emitTraceSummary(stepTrace);
        this._steps.push({
          iteration,
          action,
          reason,
          naturalLanguageAction,
          analysis: plannerResponse.analysis,
          thought: plannerResponse.thought,
          actionPayload: this._buildActionPayload(plannerResponse),
          success: true,
          screenshot: deviceState.screenshot,
          screenWidth: deviceState.screenWidth,
          screenHeight: deviceState.screenHeight,
          timestamp: new Date().toISOString(),
          durationMs: trace.totalMs,
          trace,
        });

        onProgress?.({
          type: 'goal_complete',
          iteration,
          totalIterations: maxIterations,
          status: 'success',
          action,
          reason,
          success: true,
        });

        return {
          success: true,
          status: 'success',
          message: reason,
          analysis: plannerResponse.analysis,
          platform: this._config.platform,
          startedAt,
          completedAt: new Date().toISOString(),
          steps: this._steps,
          totalIterations: iteration,
        };
      }

      if (action === PLANNER_ACTION_FAILED) {
        Logger.w('✖ Goal failed: ' + reason);
        stepTrace.markFailure(reason);
        const trace = this._emitTraceSummary(stepTrace);
        this._steps.push({
          iteration,
          action,
          reason,
          naturalLanguageAction,
          analysis: plannerResponse.analysis,
          thought: plannerResponse.thought,
          actionPayload: this._buildActionPayload(plannerResponse),
          success: false,
          screenshot: deviceState.screenshot,
          screenWidth: deviceState.screenWidth,
          screenHeight: deviceState.screenHeight,
          timestamp: new Date().toISOString(),
          durationMs: trace.totalMs,
          trace,
        });

        onProgress?.({
          type: 'goal_complete',
          iteration,
          totalIterations: maxIterations,
          status: 'failure',
          action,
          reason,
          success: false,
        });

        return {
          success: false,
          status: 'failure',
          message: reason,
          analysis: plannerResponse.analysis,
          platform: this._config.platform,
          startedAt,
          completedAt: new Date().toISOString(),
          steps: this._steps,
          totalIterations: iteration,
        };
      }

      onProgress?.({
        type: 'executing',
        iteration,
        totalIterations: maxIterations,
        action,
        reason,
      });

      const actionPhase = startTracePhase(iteration, 'action.total');
      const actionResult = await this._actionExecutor.executeAction({
        action,
        reason,
        text: plannerResponse.text,
        clearText: plannerResponse.clearText,
        direction: plannerResponse.direction,
        durationSeconds: plannerResponse.durationSeconds,
        url: plannerResponse.url,
        repeat: plannerResponse.repeat,
        delayBetweenTapMs: plannerResponse.delayBetweenTapMs,
        screenshot: deviceState.screenshot,
        hierarchy: deviceState.hierarchy,
        screenWidth: deviceState.screenWidth,
        screenHeight: deviceState.screenHeight,
        traceStep: iteration,
      });

      const actionSpan = stepTrace.addSpanFromActivePhase(
        actionPhase,
        actionResult.success ? 'success' : 'failure',
        actionResult.error,
      );
      stepTrace.addSequentialTimings(actionResult.trace, {
        startMs: actionSpan.startMs,
      });

      if (actionResult.terminalFailure) {
        stepTrace.markFailure(actionResult.terminalFailure.message);
        const trace = this._emitTraceSummary(stepTrace);
        this._steps.push({
          iteration,
          action,
          reason,
          naturalLanguageAction,
          analysis: plannerResponse.analysis,
          thought: plannerResponse.thought,
          actionPayload: this._buildActionPayload(plannerResponse),
          success: false,
          errorMessage: actionResult.terminalFailure.message,
          screenshot: deviceState.screenshot,
          screenWidth: deviceState.screenWidth,
          screenHeight: deviceState.screenHeight,
          timestamp: new Date().toISOString(),
          durationMs: trace.totalMs,
          trace,
        });

        Logger.e(actionResult.terminalFailure.message);
        onProgress?.({
          type: 'error',
          iteration,
          totalIterations: maxIterations,
          message: actionResult.terminalFailure.message,
        });

        return {
          success: false,
          status: 'failure',
          message: actionResult.terminalFailure.message,
          terminalFailure: actionResult.terminalFailure,
          analysis: plannerResponse.analysis,
          platform: this._config.platform,
          startedAt,
          completedAt: new Date().toISOString(),
          steps: this._steps,
          totalIterations: iteration,
        };
      }

      const postCapturePhase = startTracePhase(iteration, 'post_capture.total');
      const postActionCapture = await this._capturePostActionScreenshot(iteration);
      const postCaptureSpan = stepTrace.addSpanFromActivePhase(
        postCapturePhase,
        postActionCapture.status === 'success' ? 'success' : 'failure',
        postActionCapture.status === 'success' ? undefined : postActionCapture.message,
      );
      stepTrace.addSequentialTimings(
        this._captureTraceToTimings(postActionCapture.captureTrace, 'post_capture'),
        {
          startMs: postCaptureSpan.startMs,
        },
      );

      if (postActionCapture.status !== 'success') {
        Logger.w(
          `Post-action screenshot capture failed for iteration ${iteration}: ${postActionCapture.message ?? 'unknown capture error'}`,
        );
      }

      const stepResult: AgentActionResult = {
        iteration,
        action,
        reason,
        naturalLanguageAction,
        analysis: plannerResponse.analysis,
        thought: plannerResponse.thought,
        actionPayload: this._buildActionPayload(plannerResponse),
        success: actionResult.success,
        errorMessage: actionResult.error,
        screenshot: postActionCapture.screenshot,
        screenWidth: postActionCapture.screenWidth ?? deviceState.screenWidth,
        screenHeight: postActionCapture.screenHeight ?? deviceState.screenHeight,
        timestamp: new Date().toISOString(),
        timing: actionResult.trace,
      };

      if (!actionResult.success && actionResult.error) {
        stepTrace.markFailure(actionResult.error);
      }

      const trace = this._emitTraceSummary(stepTrace);
      stepResult.trace = trace;
      stepResult.durationMs = trace.totalMs;
      this._steps.push(stepResult);

      onProgress?.({
        type: 'step_complete',
        iteration,
        totalIterations: maxIterations,
        action,
        reason,
        success: actionResult.success,
        message: actionResult.error,
      });

      const statusText = actionResult.success ? 'SUCCESS' : `FAILED: ${actionResult.error}`;
      history += `${iteration}. [${action}] ${this._formatHistoryReason(plannerResponse)} → ${statusText}\n`;
    }

    Logger.w(`Max iterations (${maxIterations}) reached`);
    return {
      success: false,
      status: 'failure',
      message: `Max iterations (${maxIterations}) exceeded without completing the goal`,
      platform: this._config.platform,
      startedAt,
      completedAt: new Date().toISOString(),
      steps: this._steps,
      totalIterations: maxIterations,
    };
  }

  // ---------- private ----------

  private async _captureDeviceState(
    traceStep: number,
  ): Promise<DeviceStateCaptureResult> {
    try {
      const response = await this._config.agent.executeAction(
        new DeviceActionRequest({
          requestId: uuidv4(),
          action: new GetScreenshotAndHierarchyAction(),
          timeout: 30,
          shouldEnsureStability: true,
          traceStep,
        }),
      );

      const captureTrace = response.data
        ? this._parseCaptureTrace(response.data['captureTrace'])
        : undefined;

      if (!response.success || !response.data) {
        const message = response.message ?? 'Failed to capture device state';
        return {
          status: this._isTransientCaptureFailure(message) ? 'transient' : 'fatal',
          message,
          captureTrace,
        };
      }

      const data = response.data;
      const screenshot = data['screenshot'] as string;
      const hierarchyStr = data['hierarchy'] as string;
      const screenWidth = data['screenWidth'] as number;
      const screenHeight = data['screenHeight'] as number;

      if (!screenshot?.trim()) {
        return {
          status: 'transient',
          message: 'Empty screenshot from device capture',
          captureTrace,
        };
      }

      if (!hierarchyStr?.trim()) {
        return {
          status: 'transient',
          message: 'Missing hierarchy from device capture',
          captureTrace,
        };
      }

      const hierarchy = Hierarchy.fromJsonString(hierarchyStr);

      return {
        status: 'success',
        captureTrace,
        deviceState: {
          screenshot,
          hierarchy,
          screenWidth,
          screenHeight,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: this._isTransientCaptureFailure(message) ? 'transient' : 'fatal',
        message,
      };
    }
  }

  private _emitTraceSummary(stepTrace: StepTraceBuilder): StepTrace {
    const trace = stepTrace.build();
    Logger.d(formatStepTraceSummary(trace));
    return trace;
  }

  private _captureTraceToTimings(
    captureTrace: CaptureTraceMetadata | undefined,
    prefix: 'capture' | 'post_capture' = 'capture',
  ): TimingMetadata | undefined {
    if (!captureTrace) {
      return undefined;
    }

    const spans: SpanTiming[] = [];
    if (captureTrace.stabilityMs !== undefined) {
      spans.push({
        name: `${prefix}.stability`,
        durationMs: captureTrace.stabilityMs,
        status: captureTrace.stable ? 'success' : 'failure',
        detail: `polls=${captureTrace.pollCount}`,
      });
    }

    spans.push({
      name: `${prefix}.final_payload`,
      durationMs: captureTrace.finalPayloadMs,
      status: captureTrace.failureReason ? 'failure' : 'success',
      detail:
        `attempts=${captureTrace.attempts}` +
        (captureTrace.failureReason ? ` reason=${captureTrace.failureReason}` : ''),
    });

    return {
      totalMs: captureTrace.totalMs,
      spans,
    };
  }

  private async _capturePostActionScreenshot(
    traceStep: number,
  ): Promise<PostActionCaptureResult> {
    try {
      const response = await this._config.agent.executeAction(
        new DeviceActionRequest({
          requestId: uuidv4(),
          action: new GetScreenshotAndHierarchyAction(),
          timeout: 30,
          shouldEnsureStability: true,
          traceStep,
        }),
      );

      const captureTrace = response.data
        ? this._parseCaptureTrace(response.data['captureTrace'])
        : undefined;

      if (!response.success || !response.data) {
        const message = response.message ?? 'Failed to capture post-action screenshot';
        return {
          status: this._isTransientCaptureFailure(message) ? 'transient' : 'fatal',
          message,
          captureTrace,
        };
      }

      const data = response.data;
      const screenshot = data['screenshot'] as string | undefined;
      if (!screenshot?.trim()) {
        return {
          status: 'transient',
          message: 'Empty screenshot from post-action capture',
          captureTrace,
        };
      }

      return {
        status: 'success',
        screenshot,
        screenWidth:
          typeof data['screenWidth'] === 'number'
            ? (data['screenWidth'] as number)
            : undefined,
        screenHeight:
          typeof data['screenHeight'] === 'number'
            ? (data['screenHeight'] as number)
            : undefined,
        captureTrace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: this._isTransientCaptureFailure(message) ? 'transient' : 'fatal',
        message,
      };
    }
  }

  private _plannerTraceToTimings(
    plannerResponse: PlannerResponse,
  ): TimingMetadata | undefined {
    if (!plannerResponse.trace) {
      return undefined;
    }

    return {
      totalMs: plannerResponse.trace.totalMs,
      spans: [
        {
          name: 'planning.llm',
          durationMs: plannerResponse.trace.promptBuildMs + plannerResponse.trace.llmMs,
          status: 'success',
          detail:
            `prompt=${plannerResponse.trace.promptBuildMs}ms ` +
            `model=${plannerResponse.trace.llmMs}ms`,
        },
        {
          name: 'planning.parse',
          durationMs: plannerResponse.trace.parseMs,
          status: 'success',
        },
      ],
    };
  }

  private _parseCaptureTrace(value: unknown): CaptureTraceMetadata | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const totalMs = toNumber(record['totalMs']);
    const finalPayloadMs = toNumber(record['finalPayloadMs']);
    if (totalMs === undefined || finalPayloadMs === undefined) {
      return undefined;
    }

    return {
      totalMs,
      stabilityMs: toNumber(record['stabilityMs']),
      finalPayloadMs,
      stable: Boolean(record['stable']),
      pollCount: toNumber(record['pollCount']) ?? 0,
      attempts: toNumber(record['attempts']) ?? 0,
      failureReason:
        typeof record['failureReason'] === 'string'
          ? record['failureReason']
          : undefined,
    };
  }

  private _isTransientCaptureFailure(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('uiautomation not connected') ||
      normalized.includes('unavailable') ||
      normalized.includes('no connection established') ||
      normalized.includes('empty screenshot') ||
      normalized.includes('missing hierarchy') ||
      normalized.includes('invalid hierarchy')
    );
  }

  private _formatHistoryReason(plannerResponse: PlannerResponse): string {
    const details: string[] = [];

    if (plannerResponse.text) {
      details.push(`text="${plannerResponse.text}"`);
    }
    if (plannerResponse.direction) {
      details.push(`direction=${plannerResponse.direction}`);
    }
    if (plannerResponse.durationSeconds !== undefined) {
      details.push(`duration=${plannerResponse.durationSeconds}s`);
    }
    if (plannerResponse.url) {
      details.push(`url=${plannerResponse.url}`);
    }
    if (plannerResponse.repeat !== undefined) {
      details.push(`repeat=${plannerResponse.repeat}`);
    }
    if (plannerResponse.delayBetweenTapMs !== undefined) {
      details.push(`delayBetweenTapMs=${plannerResponse.delayBetweenTapMs}`);
    }

    if (details.length === 0) {
      return plannerResponse.reason;
    }

    return `${plannerResponse.reason} (${details.join(', ')})`;
  }

  private _buildActionPayload(
    plannerResponse: PlannerResponse,
  ): ActionPayload | undefined {
    const payload: ActionPayload = {
      text: plannerResponse.text,
      url: plannerResponse.url,
      direction: plannerResponse.direction,
      clearText: plannerResponse.clearText,
      durationSeconds: plannerResponse.durationSeconds,
      repeat: plannerResponse.repeat,
      delayBetweenTapMs: plannerResponse.delayBetweenTapMs,
    };

    return Object.values(payload).some((value) => value !== undefined)
      ? payload
      : undefined;
  }
}

function toNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.max(0, Math.round(value));
}
