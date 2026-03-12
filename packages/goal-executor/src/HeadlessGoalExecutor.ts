// Port of goal_executor/lib/src/HeadlessGoalExecutor.dart
// The main loop: screenshot → plan → act → repeat.

import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  DeviceActionRequest,
  Hierarchy,
  Logger,
  GetScreenshotAndHierarchyAction,
  DEFAULT_MAX_ITERATIONS,
  PLANNER_ACTION_COMPLETED,
  PLANNER_ACTION_FAILED,
} from '@finalrun/common';
import { AIAgent, PlannerResponse } from './ai/AIAgent.js';
import { HeadlessActionExecutor } from './HeadlessActionExecutor.js';

// ============================================================================
// Types
// ============================================================================

export interface GoalExecutorConfig {
  goal: string;
  platform: string;
  maxIterations?: number;
  agent: Agent;
  aiAgent: AIAgent;
}

export interface StepResult {
  iteration: number;
  action: string;
  reason: string;
  success: boolean;
  errorMessage?: string;
}

export interface GoalResult {
  success: boolean;
  message: string;
  steps: StepResult[];
  totalIterations: number;
}

/**
 * Progress callback — called on each iteration.
 * Used by the CLI's terminal renderer to show live progress.
 */
export type GoalProgressCallback = (event: GoalProgressEvent) => void;

export interface GoalProgressEvent {
  type: 'planning' | 'executing' | 'step_complete' | 'goal_complete' | 'error';
  iteration: number;
  totalIterations: number;
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

type DeviceStateCaptureResult =
  | {
      status: 'success';
      deviceState: DeviceState;
    }
  | {
      status: 'transient' | 'fatal';
      message: string;
    };

const MAX_CONSECUTIVE_TRANSIENT_CAPTURE_FAILURES = 2;

// ============================================================================
// HeadlessGoalExecutor
// ============================================================================

/**
 * Orchestrates the full goal execution loop:
 *   1. Capture device state (screenshot + hierarchy)
 *   2. Call AI planner → get next action
 *   3. Execute action via HeadlessActionExecutor
 *   4. Record result, check for done/failure
 *   5. Repeat
 *
 * Dart equivalent: HeadlessGoalExecutor in goal_executor/lib/src/HeadlessGoalExecutor.dart
 */
export class HeadlessGoalExecutor {
  private _config: GoalExecutorConfig;
  private _actionExecutor: HeadlessActionExecutor;
  private _cancelled: boolean = false;
  private _steps: StepResult[] = [];

  constructor(config: GoalExecutorConfig) {
    this._config = config;
    this._actionExecutor = new HeadlessActionExecutor({
      agent: config.agent,
      aiAgent: config.aiAgent,
      platform: config.platform,
    });
  }

  /**
   * Cancel the goal execution.
   * The loop will stop after the current iteration completes.
   */
  cancel(): void {
    this._cancelled = true;
    Logger.i('Goal execution cancelled');
  }

  /**
   * Execute the goal. Main entry point.
   *
   * Dart: Future<void> executeGoal(...)
   */
  async executeGoal(
    onProgress?: GoalProgressCallback,
  ): Promise<GoalResult> {
    const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    let history = '';
    let remember: string[] = [];
    let consecutiveTransientCaptureFailures = 0;

    Logger.i(`Starting goal execution: "${this._config.goal}"`);
    Logger.i(`Max iterations: ${maxIterations}`);

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      // Check cancellation
      if (this._cancelled) {
        return {
          success: false,
          message: 'Goal execution was cancelled',
          steps: this._steps,
          totalIterations: iteration - 1,
        };
      }

      // -- Step 1: Capture device state --
      onProgress?.({
        type: 'planning',
        iteration,
        totalIterations: maxIterations,
        message: 'Capturing device state...',
      });

      const captureResult = await this._captureDeviceState();
      if (captureResult.status !== 'success') {
        consecutiveTransientCaptureFailures += 1;
        this._steps.push({
          iteration,
          action: 'captureDeviceState',
          reason: captureResult.message,
          success: false,
          errorMessage: captureResult.message,
        });

        onProgress?.({
          type: 'error',
          iteration,
          totalIterations: maxIterations,
          message: captureResult.message,
        });

        if (captureResult.status === 'fatal') {
          return {
            success: false,
            message: captureResult.message,
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
            message: `Repeated transient device state capture failures: ${captureResult.message}`,
            steps: this._steps,
            totalIterations: iteration,
          };
        }

        continue;
      }
      consecutiveTransientCaptureFailures = 0;
      const deviceState = captureResult.deviceState;

      // -- Step 2: Call AI planner --
      onProgress?.({
        type: 'planning',
        iteration,
        totalIterations: maxIterations,
        message: 'AI is thinking...',
      });

      let plannerResponse: PlannerResponse;
      try {
        plannerResponse = await this._config.aiAgent.plan({
          testCase: this._config.goal,
          platform: this._config.platform,
          preActionScreenshot: deviceState.screenshot,
          hierarchy: deviceState.hierarchy,
          history: history || undefined,
          remember: remember.length > 0 ? remember : undefined,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.e('Planner call failed:', error);

        this._steps.push({
          iteration,
          action: 'plannerError',
          reason: errorMsg,
          success: false,
          errorMessage: errorMsg,
        });

        onProgress?.({
          type: 'error',
          iteration,
          totalIterations: maxIterations,
          message: `Planner error: ${errorMsg}`,
        });
        continue; // retry
      }

      const action = plannerResponse.act;
      const reason = plannerResponse.reason;

      Logger.i(`[${iteration}/${maxIterations}] Action: ${action} — ${reason}`);

      // Update remember context
      remember = plannerResponse.remember;

      // -- Check for completion --
      if (action === PLANNER_ACTION_COMPLETED) {
        Logger.i('✓ Goal completed successfully!');
        this._steps.push({ iteration, action, reason, success: true });

        onProgress?.({
          type: 'goal_complete',
          iteration,
          totalIterations: maxIterations,
          action,
          reason,
          success: true,
        });

        return {
          success: true,
          message: reason,
          steps: this._steps,
          totalIterations: iteration,
        };
      }

      // -- Check for failure --
      if (action === PLANNER_ACTION_FAILED) {
        Logger.w('✖ Goal failed: ' + reason);
        this._steps.push({ iteration, action, reason, success: false });

        onProgress?.({
          type: 'goal_complete',
          iteration,
          totalIterations: maxIterations,
          action,
          reason,
          success: false,
        });

        return {
          success: false,
          message: reason,
          steps: this._steps,
          totalIterations: iteration,
        };
      }

      // -- Step 3: Execute the action --
      onProgress?.({
        type: 'executing',
        iteration,
        totalIterations: maxIterations,
        action,
        reason,
      });

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
      });

      // Record step result
      const stepResult: StepResult = {
        iteration,
        action,
        reason,
        success: actionResult.success,
        errorMessage: actionResult.error,
      };
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

      // Update history for next planner call
      const statusText = actionResult.success ? 'SUCCESS' : `FAILED: ${actionResult.error}`;
      history += `${iteration}. [${action}] ${this._formatHistoryReason(plannerResponse)} → ${statusText}\n`;
    }

    // Exceeded max iterations
    Logger.w(`Max iterations (${maxIterations}) reached`);
    return {
      success: false,
      message: `Max iterations (${maxIterations}) exceeded without completing the goal`,
      steps: this._steps,
      totalIterations: maxIterations,
    };
  }

  // ---------- private ----------

  /**
   * Capture the current device state: screenshot + hierarchy.
   */
  private async _captureDeviceState(): Promise<DeviceStateCaptureResult> {
    try {
      const response = await this._config.agent.executeAction(
        new DeviceActionRequest({
          requestId: uuidv4(),
          action: new GetScreenshotAndHierarchyAction(),
          timeout: 30,
          shouldEnsureStability: true,
        }),
      );

      if (!response.success || !response.data) {
        const message = response.message ?? 'Failed to capture device state';
        return {
          status: this._isTransientCaptureFailure(message) ? 'transient' : 'fatal',
          message,
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
        };
      }

      if (!hierarchyStr?.trim()) {
        return {
          status: 'transient',
          message: 'Missing hierarchy from device capture',
        };
      }

      const hierarchy = hierarchyStr
        ? Hierarchy.fromJsonString(hierarchyStr)
        : new Hierarchy(null);

      return {
        status: 'success',
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
}
