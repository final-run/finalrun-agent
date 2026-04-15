// Multi-Device Orchestrator — sibling to TestExecutor.
//
// Runs the active-device-scoped loop:
//   parse `${devices.X}` tokens in the current step → active set (1 or 2)
//   → parallel capture from active devices
//   → planMulti() → dispatch actions (1 sequential or 2 via Promise.all)
//   → advance stepIndex by parsing `thought.plan` for `[→ ...]` marker
//   → watchdog: abort FAIL if same stepIndex persists >5 iterations
//
// Composes existing single-device building blocks (ActionExecutor, AIAgent)
// WITHOUT modifying them. A small internal `DeviceExecutor` wraps one
// DeviceAgent + one ActionExecutor per device.
//
// Single-device paths (TestExecutor.ts, ActionExecutor.ts) are NOT modified.
import { v4 as uuidv4 } from 'uuid';
import {
  DeviceActionRequest,
  DeviceAgent,
  GetScreenshotAndHierarchyAction,
  Hierarchy,
  Logger,
  DEFAULT_MAX_ITERATIONS,
  PLANNER_ACTION_COMPLETED,
  PLANNER_ACTION_FAILED,
  type RuntimeBindings,
} from '@finalrun/common';
import {
  AIAgent,
  type MultiDeviceActiveState,
  type MultiDevicePlannerRequest,
  type MultiDevicePlannerResponse,
  type PlannerAction,
} from './ai/AIAgent.js';
import { ActionExecutor, type ActionOutput } from './ActionExecutor.js';

// ============================================================================
// Constants
// ============================================================================

/** Regex used to parse `${devices.X}`, `${variables.X}`, `${secrets.X}` tokens
 * in a step string. Only `devices.*` matches are meaningful for active-device
 * scoping; other groups pass through unchanged. */
const MULTI_DEVICE_TOKEN_PATTERN = /\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g;

/** Markers the planner emits in `thought.plan`:
 *   `[✓ …]` — completed step (any text).
 *   `[→ …]` — in-progress step; step ordinal = (count of preceding `[✓ …]`) + 1.
 *   `[○ …]` — upcoming step.
 *   `[→ 3]` or `[→ step 3]` — optional digit form; if present, used directly.
 *
 * Natural-language form (`[→ alice sends message]`) is the canonical output of
 * `multi-device-planner.md`; digit form is accepted for backward compatibility.
 * When no `[→ …]` is found or the plan is empty, the orchestrator holds
 * `stepIndex`. */
const PLAN_COMPLETED_MARKER_PATTERN = /\[✓[^\]]*\]/g;
const PLAN_ADVANCE_DIGIT_PATTERN = /\[→\s*(?:step\s+)?(\d+)\s*\]/i;
const PLAN_ADVANCE_MARKER_PATTERN = /\[→[^\]]*\]/;

/** Watchdog: abort FAIL if `stepIndex` persists >N consecutive iterations
 * without a terminal action. Spec pins the FAIL reason string. */
const WATCHDOG_STUCK_THRESHOLD = 5;

/** Graceful gRPC cancellation budget when abort fires mid-dispatch.
 *  Per spec assumption #16: 2s graceful + 3s teardown = 5s fail-fast ceiling. */
const GRACEFUL_ABORT_BUDGET_MS = 2000;

// ============================================================================
// Public types
// ============================================================================

/** One device's wiring passed into the orchestrator. Created by
 * `prepareMultiDeviceTestSession()` (cli/src/multiDeviceSessionRunner.ts). */
export interface MultiDeviceOrchestratorDeviceInput {
  key: string;
  agent: DeviceAgent;
  platform: string;
  appIdentifier?: string;
  /** Optional recording lifecycle hooks. When provided, the orchestrator calls
   *  `startRecording()` at test start and `stopRecording()` at teardown using
   *  `Promise.all` across all configured devices. Pair of functions matches
   *  the surface area exposed by `Device.startRecordingScoped`/`stopRecordingScoped`
   *  so the CLI can thread device-scoped recording without forcing every
   *  `DeviceAgent` implementation to grow new methods. */
  startRecording?: () => Promise<{ startedAt: string; filePath?: string }>;
  stopRecording?: () => Promise<{ completedAt?: string; filePath?: string }>;
}

export interface MultiDeviceRecordingMetadata {
  /** ISO timestamp of the earliest device recording start (shared-scrubber anchor). */
  anchorStartedAt: string;
  /** Per-device `{startedAt, filePath?}`. Populated only when `startRecording` hooks ran. */
  devices: Record<string, { startedAt: string; filePath?: string; completedAt?: string }>;
}

export interface MultiDeviceOrchestratorConfig {
  /** Compiled goal string handed to the planner as-is (already has `Devices:`
   *  header + numbered steps; `${secrets.*}` and `${devices.*}` preserved
   *  literally by the compiler). */
  goal: string;
  /** The raw numbered step strings from the test definition AFTER variable
   *  interpolation. Used only for parsing `${devices.X}` tokens for
   *  active-device scoping — NOT fed into the planner (the planner sees `goal`). */
  steps: string[];
  devices: MultiDeviceOrchestratorDeviceInput[];
  aiAgent: AIAgent;
  maxIterations?: number;
  preContext?: string;
  runtimeBindings?: RuntimeBindings;
  /** Optional external abort. Wired into the internal AbortController so the
   *  orchestrator can be canceled by the CLI layer (SIGINT, etc). */
  abortSignal?: AbortSignal;
}

export type MultiDeviceExecutionStatus = 'success' | 'failure' | 'aborted';

export interface MultiDeviceStepResult {
  iteration: number;
  stepIndex: number;
  device: string;
  action: string;
  reason: string;
  success: boolean;
  errorMessage?: string;
  timestamp: string;
}

export interface MultiDeviceExecutionResult {
  success: boolean;
  status: MultiDeviceExecutionStatus;
  message: string;
  startedAt: string;
  completedAt: string;
  steps: MultiDeviceStepResult[];
  totalIterations: number;
  finalStepIndex: number;
  /** Populated when any device's action failed terminally or the watchdog fired. */
  failureReason?: string;
  /** Populated when `startRecording` hooks were provided on the device inputs. */
  recording?: MultiDeviceRecordingMetadata;
}

// ============================================================================
// Internal types
// ============================================================================

interface DeviceState {
  screenshot: string;
  hierarchy: Hierarchy;
  screenWidth: number;
  screenHeight: number;
}

interface DeviceExecutorInternal {
  key: string;
  agent: DeviceAgent;
  platform: string;
  actionExecutor: ActionExecutor;
  lastKnownState?: DeviceState;
}

// ============================================================================
// MultiDeviceOrchestrator
// ============================================================================

/**
 * Multi-device orchestrator. Run one `executeGoal()` per test.
 *
 * Architectural invariants (single-device preservation):
 *   - Does NOT import or subclass `TestExecutor` — separate control flow.
 *   - Uses existing `ActionExecutor` class via composition (new instance per
 *     device). `ActionExecutor` is not modified.
 *   - Calls existing `AIAgent.planMulti()` (new sibling method). Existing
 *     `plan()` signature is untouched.
 */
export class MultiDeviceOrchestrator {
  private readonly _config: MultiDeviceOrchestratorConfig;
  private readonly _deviceExecutors: Map<string, DeviceExecutorInternal>;
  private readonly _abortController: AbortController;
  private readonly _externalAbortListener?: () => void;
  private _steps: MultiDeviceStepResult[] = [];
  private _stepIndex = 1;
  private _stuckIterations = 0;
  private _lastStepIndex = 0;
  private _recordingStarts: Record<string, { startedAt: string; filePath?: string }> = {};
  private _recordingStops: Record<string, { completedAt?: string; filePath?: string }> = {};
  private _recordingsStopped = false;

  constructor(config: MultiDeviceOrchestratorConfig) {
    this._config = config;
    this._abortController = new AbortController();
    if (config.abortSignal) {
      const listener = () => this._abortController.abort();
      if (config.abortSignal.aborted) {
        this._abortController.abort();
      } else {
        config.abortSignal.addEventListener('abort', listener);
        this._externalAbortListener = listener;
      }
    }

    this._deviceExecutors = new Map();
    for (const input of config.devices) {
      this._deviceExecutors.set(input.key, {
        key: input.key,
        agent: input.agent,
        platform: input.platform,
        actionExecutor: new ActionExecutor({
          agent: input.agent,
          aiAgent: config.aiAgent,
          platform: input.platform,
          appIdentifier: input.appIdentifier,
          runtimeBindings: config.runtimeBindings,
        }),
      });
    }
  }

  /**
   * Abort the orchestrator. Triggers `AbortController.abort()` — any in-flight
   * action dispatch that honors the signal will be interrupted. The loop
   * returns at the next iteration boundary with `status: 'aborted'`.
   */
  abort(): void {
    this._abortController.abort();
    Logger.i('MultiDeviceOrchestrator: abort requested');
  }

  /**
   * Main entry point. Runs the active-device-scoped loop.
   */
  async executeGoal(): Promise<MultiDeviceExecutionResult> {
    const startedAt = new Date().toISOString();
    const maxIterations = this._config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const configuredDeviceKeys = this._config.devices.map((d) => d.key);
    const rememberEntries: Array<{ device: string; note: string }> = [];
    let history = '';

    // Start per-device recordings in parallel (if hooks were provided).
    await this._startRecordings();

    Logger.i(`MultiDeviceOrchestrator: starting, ${this._config.steps.length} steps`);

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      if (this._abortController.signal.aborted) {
        return this._buildResult(
          'aborted',
          'Execution aborted',
          startedAt,
          iteration - 1,
        );
      }

      // Watchdog: same stepIndex > N iterations → pin the exact spec reason.
      if (this._stepIndex === this._lastStepIndex) {
        this._stuckIterations += 1;
        if (this._stuckIterations > WATCHDOG_STUCK_THRESHOLD) {
          const reason = `watchdog: step ${this._stepIndex} stuck for >${WATCHDOG_STUCK_THRESHOLD} iterations`;
          Logger.e(`MultiDeviceOrchestrator: ${reason}`);
          return this._buildResult('failure', reason, startedAt, iteration - 1, reason);
        }
      } else {
        this._stuckIterations = 0;
        this._lastStepIndex = this._stepIndex;
      }

      // 1. Resolve active device set from the current step's tokens.
      const currentStep = this._config.steps[this._stepIndex - 1];
      if (!currentStep) {
        // stepIndex past the end → assume completion
        return this._buildResult(
          'success',
          `Advanced past final step ${this._config.steps.length}`,
          startedAt,
          iteration - 1,
        );
      }
      const activeDeviceKeys = this._extractActiveDevices(currentStep, configuredDeviceKeys);

      // 2. Capture pre-action state from the active device(s) in parallel.
      const activeStates: Record<string, MultiDeviceActiveState> = {};
      try {
        const captures = await Promise.all(
          activeDeviceKeys.map(async (key) => {
            const executor = this._deviceExecutors.get(key)!;
            const state = await this._captureDeviceState(executor);
            executor.lastKnownState = state;
            return { key, state };
          }),
        );
        for (const { key, state } of captures) {
          activeStates[key] = {
            postActionScreenshot: state.screenshot,
            hierarchy: state.hierarchy,
            platform: this._deviceExecutors.get(key)!.platform,
          };
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        Logger.e(`MultiDeviceOrchestrator: capture failed on iteration ${iteration}: ${reason}`);
        return this._buildResult(
          'failure',
          `Device capture failed: ${reason}`,
          startedAt,
          iteration,
          reason,
        );
      }

      // 3. Call the multi-device planner.
      let plannerResponse: MultiDevicePlannerResponse;
      try {
        plannerResponse = await this._config.aiAgent.planMulti({
          testObjective: this._config.goal,
          devices: configuredDeviceKeys,
          activeDeviceStates: activeStates,
          history,
          remember: rememberEntries,
          preContext: this._config.preContext,
          traceStep: iteration,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        Logger.e(`MultiDeviceOrchestrator: planner failed on iteration ${iteration}: ${reason}`);
        return this._buildResult(
          'failure',
          `Planner failed: ${reason}`,
          startedAt,
          iteration,
          reason,
        );
      }

      // 4. Merge remember entries (device-tagged).
      for (const entry of plannerResponse.remember) {
        rememberEntries.push(entry);
      }

      // 5. Empty actions = observation-only turn. Still advance stepIndex
      //    if the plan marker says so.
      if (plannerResponse.actions.length === 0) {
        Logger.i(`MultiDeviceOrchestrator: iteration ${iteration} — observation-only turn`);
        this._advanceStepIndex(plannerResponse);
        history = appendHistory(history, iteration, 'observation', '(no action)', 'continuing');
        continue;
      }

      // 6. Terminal check. A COMPLETED/FAILED on ANY device is terminal.
      const terminalAction = plannerResponse.actions.find(
        (a) =>
          a.action.act === PLANNER_ACTION_COMPLETED ||
          a.action.act === PLANNER_ACTION_FAILED,
      );
      if (terminalAction) {
        const success = terminalAction.action.act === PLANNER_ACTION_COMPLETED;
        const reason =
          terminalAction.action.reason ??
          (success ? 'Goal completed' : 'Goal failed');
        this._recordStep(iteration, terminalAction, success, reason);
        return this._buildResult(
          success ? 'success' : 'failure',
          reason,
          startedAt,
          iteration,
          success ? undefined : reason,
        );
      }

      // 7. Dispatch actions.
      const dispatchResults = await this._dispatchActions(
        plannerResponse.actions,
        iteration,
      );
      for (const { entry, result, reason } of dispatchResults) {
        this._recordStep(iteration, entry, result.success, reason);
        history = appendHistory(
          history,
          iteration,
          entry.device,
          entry.action.act,
          result.success ? 'ok' : `FAIL: ${result.error ?? 'unknown error'}`,
        );
      }

      // 8. Fail-fast: any action failed terminally → FAIL.
      const failedDispatch = dispatchResults.find((r) => !r.result.success);
      if (failedDispatch) {
        const reason = `action ${failedDispatch.entry.action.act} on device '${failedDispatch.entry.device}' failed: ${failedDispatch.result.error ?? 'unknown'}`;
        return this._buildResult('failure', reason, startedAt, iteration, reason);
      }

      // 9. Advance step pointer per planner's `[→ N]` marker.
      this._advanceStepIndex(plannerResponse);

      if (this._stepIndex > this._config.steps.length) {
        return this._buildResult(
          'success',
          `Advanced past final step ${this._config.steps.length}`,
          startedAt,
          iteration,
        );
      }
    }

    return this._buildResult(
      'failure',
      `Hit max iterations (${maxIterations}) without terminal status`,
      startedAt,
      maxIterations,
      'max iterations exceeded',
    );
  }

  // ==========================================================================
  // Internal helpers — kept small and named per iteration-phase intent.
  // ==========================================================================

  /** Parse `${devices.X}` tokens from the step string; return active device
   *  keys in configured order. Falls back to all devices when no tokens found
   *  (should not happen — loader rejects token-free steps, but safe default). */
  private _extractActiveDevices(
    step: string,
    configuredDeviceKeys: string[],
  ): string[] {
    const found = new Set<string>();
    for (const match of step.matchAll(MULTI_DEVICE_TOKEN_PATTERN)) {
      if (match[1] === 'devices' && match[2]) {
        found.add(match[2]);
      }
    }
    if (found.size === 0) {
      return [...configuredDeviceKeys];
    }
    return configuredDeviceKeys.filter((key) => found.has(key));
  }

  /** Capture screenshot + hierarchy from a single device. */
  private async _captureDeviceState(
    executor: DeviceExecutorInternal,
  ): Promise<DeviceState> {
    const response = await executor.agent.executeAction(
      new DeviceActionRequest({
        requestId: uuidv4(),
        action: new GetScreenshotAndHierarchyAction(),
        timeout: 30,
        shouldEnsureStability: true,
      }),
    );
    if (!response.success || !response.data) {
      throw new Error(
        `Device '${executor.key}' capture failed: ${response.message ?? 'unknown error'}`,
      );
    }
    const screenshot = response.data['screenshot'] as string;
    const hierarchyStr = response.data['hierarchy'] as string;
    const screenWidth = response.data['screenWidth'] as number;
    const screenHeight = response.data['screenHeight'] as number;
    if (!screenshot?.trim() || !hierarchyStr?.trim()) {
      throw new Error(
        `Device '${executor.key}' capture returned empty screenshot or hierarchy`,
      );
    }
    return {
      screenshot,
      hierarchy: Hierarchy.fromJsonString(hierarchyStr),
      screenWidth,
      screenHeight,
    };
  }

  /** Dispatch one or two actions. A single action runs sequentially;
   *  two distinct-device actions run via `Promise.all`. */
  private async _dispatchActions(
    entries: Array<{ device: string; action: PlannerAction }>,
    iteration: number,
  ): Promise<
    Array<{
      entry: { device: string; action: PlannerAction };
      result: ActionOutput;
      reason: string;
    }>
  > {
    const runOne = async (entry: {
      device: string;
      action: PlannerAction;
    }): Promise<{
      entry: { device: string; action: PlannerAction };
      result: ActionOutput;
      reason: string;
    }> => {
      const executor = this._deviceExecutors.get(entry.device);
      if (!executor || !executor.lastKnownState) {
        return {
          entry,
          result: {
            success: false,
            error: `Device '${entry.device}' has no captured state for dispatch`,
          },
          reason: entry.action.reason ?? '',
        };
      }
      const dispatchPromise = executor.actionExecutor.executeAction({
        action: entry.action.act,
        reason: entry.action.reason ?? '',
        text: entry.action.text,
        clearText: entry.action.clearText,
        direction: entry.action.direction,
        durationSeconds: entry.action.durationSeconds,
        url: entry.action.url,
        repeat: entry.action.repeat,
        delayBetweenTapMs: entry.action.delayBetweenTapMs,
        screenshot: executor.lastKnownState.screenshot,
        hierarchy: executor.lastKnownState.hierarchy,
        screenWidth: executor.lastKnownState.screenWidth,
        screenHeight: executor.lastKnownState.screenHeight,
        traceStep: iteration,
      });

      // Race dispatch against abort. On abort, wait up to 2s for the in-flight
      // action to settle gracefully; after that, surface an aborted failure so
      // the orchestrator's combined cancel+teardown stays inside the 5s ceiling.
      const result = await this._raceAgainstAbort(
        dispatchPromise,
        `action ${entry.action.act} on device '${entry.device}'`,
      );
      return { entry, result, reason: entry.action.reason ?? '' };
    };

    if (entries.length === 1) {
      return [await runOne(entries[0]!)];
    }
    return await Promise.all(entries.map(runOne));
  }

  /**
   * Race a dispatch promise against an abort signal. When abort fires while
   * the dispatch is in flight, wait up to `GRACEFUL_ABORT_BUDGET_MS` for the
   * action to complete; if it does not, resolve with an aborted failure so the
   * orchestrator can move on to cleanup. This keeps the fail-fast path inside
   * the 5-second ceiling (2s graceful + 3s teardown) documented in
   * `multiDeviceSessionRunner.cleanup()`.
   *
   * Note: this does NOT cancel the underlying gRPC call — `ActionExecutor`
   * does not accept an `AbortSignal` (preservation constraint: the existing
   * single-device class is untouched). The gRPC call continues on the device
   * side; the orchestrator just stops waiting for it.
   */
  private async _raceAgainstAbort(
    dispatchPromise: Promise<ActionOutput>,
    label: string,
  ): Promise<ActionOutput> {
    if (!this._abortController.signal.aborted) {
      const abortPromise = new Promise<void>((resolve) => {
        const handler = () => {
          this._abortController.signal.removeEventListener('abort', handler);
          resolve();
        };
        this._abortController.signal.addEventListener('abort', handler);
      });
      const firstSettled = await Promise.race([
        dispatchPromise.then(
          (result): ['result', ActionOutput] => ['result', result],
          (error): ['error', unknown] => ['error', error],
        ),
        abortPromise.then((): ['abort'] => ['abort']),
      ]);
      if (firstSettled[0] === 'result') {
        return firstSettled[1];
      }
      if (firstSettled[0] === 'error') {
        throw firstSettled[1];
      }
      // Abort fired while dispatch was in flight. Wait up to the graceful
      // budget for the dispatch to settle before giving up.
      const graceOutcome = await Promise.race([
        dispatchPromise.then(
          (result): ['result', ActionOutput] => ['result', result],
          (error): ['error', unknown] => ['error', error],
        ),
        new Promise<['timeout']>((resolve) =>
          setTimeout(() => resolve(['timeout']), GRACEFUL_ABORT_BUDGET_MS),
        ),
      ]);
      if (graceOutcome[0] === 'result') {
        return graceOutcome[1];
      }
      if (graceOutcome[0] === 'error') {
        throw graceOutcome[1];
      }
      Logger.w(
        `MultiDeviceOrchestrator: ${label} did not settle within ${GRACEFUL_ABORT_BUDGET_MS}ms of abort; moving to teardown`,
      );
      return {
        success: false,
        error: `aborted: ${label} exceeded ${GRACEFUL_ABORT_BUDGET_MS}ms graceful cancellation budget`,
      };
    }
    // Abort already fired before dispatch started — return an aborted failure
    // immediately without awaiting the underlying call.
    return {
      success: false,
      error: `aborted: ${label} canceled before dispatch`,
    };
  }

  /** Advance `stepIndex` from `plannerResponse.thought.plan`.
   *
   *  Supports both canonical natural-language form
   *  (`[✓ alice sends] [→ bob observes] [○ bob replies]`) and digit form
   *  (`[→ 2]`, `[→ step 2]`). Digit form takes precedence; otherwise the
   *  step ordinal is computed as (count of preceding `[✓ …]`) + 1.
   *
   *  Falls back to holding `stepIndex` when neither a `[→ …]` marker nor a
   *  digit is found. */
  private _advanceStepIndex(plannerResponse: MultiDevicePlannerResponse): void {
    const plan = plannerResponse.thought?.plan;
    if (!plan) {
      return;
    }
    const digitMatch = plan.match(PLAN_ADVANCE_DIGIT_PATTERN);
    if (digitMatch && digitMatch[1]) {
      const parsed = Number.parseInt(digitMatch[1], 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        this._stepIndex = parsed;
        return;
      }
    }
    const advanceMatch = plan.match(PLAN_ADVANCE_MARKER_PATTERN);
    if (!advanceMatch) {
      return;
    }
    // Count `[✓ …]` markers that appear before the `[→ …]` marker.
    const upto = plan.slice(0, advanceMatch.index ?? plan.length);
    const completed = upto.match(PLAN_COMPLETED_MARKER_PATTERN);
    const next = (completed ? completed.length : 0) + 1;
    if (Number.isFinite(next) && next >= 1) {
      this._stepIndex = next;
    }
  }

  private _recordStep(
    iteration: number,
    entry: { device: string; action: PlannerAction },
    success: boolean,
    reason: string,
  ): void {
    this._steps.push({
      iteration,
      stepIndex: this._stepIndex,
      device: entry.device,
      action: entry.action.act,
      reason,
      success,
      timestamp: new Date().toISOString(),
      errorMessage: success ? undefined : reason,
    });
  }

  /** Fire `startRecording` hooks on all devices in parallel. Silently ignores
   *  devices without hooks. Per-device `startedAt` is captured for shared
   *  anchor computation. */
  private async _startRecordings(): Promise<void> {
    const withHooks = this._config.devices.filter((d) => d.startRecording);
    if (withHooks.length === 0) {
      return;
    }
    const results = await Promise.all(
      withHooks.map(async (d) => {
        try {
          const info = await d.startRecording!();
          return { key: d.key, info };
        } catch (error) {
          Logger.w(
            `MultiDeviceOrchestrator: startRecording for '${d.key}' failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r) {
        this._recordingStarts[r.key] = r.info;
      }
    }
  }

  /** Fire `stopRecording` hooks on all devices in parallel. Safe to call twice —
   *  protected by `_recordingsStopped`. */
  private async _stopRecordings(): Promise<void> {
    if (this._recordingsStopped) {
      return;
    }
    this._recordingsStopped = true;
    const withHooks = this._config.devices.filter((d) => d.stopRecording);
    if (withHooks.length === 0) {
      return;
    }
    const results = await Promise.all(
      withHooks.map(async (d) => {
        try {
          const info = await d.stopRecording!();
          return { key: d.key, info };
        } catch (error) {
          Logger.w(
            `MultiDeviceOrchestrator: stopRecording for '${d.key}' failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }
      }),
    );
    for (const r of results) {
      if (r) {
        this._recordingStops[r.key] = r.info;
      }
    }
  }

  private _buildResult(
    status: MultiDeviceExecutionStatus,
    message: string,
    startedAt: string,
    totalIterations: number,
    failureReason?: string,
  ): MultiDeviceExecutionResult {
    if (this._externalAbortListener && this._config.abortSignal) {
      this._config.abortSignal.removeEventListener('abort', this._externalAbortListener);
    }
    const recording = this._buildRecordingMetadata();
    // Fire-and-forget stop (callers may also invoke session cleanup). Recording
    // stop is best-effort — failures are logged but never fail the test result.
    void this._stopRecordings();
    return {
      success: status === 'success',
      status,
      message,
      startedAt,
      completedAt: new Date().toISOString(),
      steps: [...this._steps],
      totalIterations,
      finalStepIndex: this._stepIndex,
      failureReason,
      recording,
    };
  }

  /** Compute shared-timeline anchor = earliest device startedAt. Returns
   *  `undefined` when no device recordings were started. */
  private _buildRecordingMetadata(): MultiDeviceRecordingMetadata | undefined {
    const keys = Object.keys(this._recordingStarts);
    if (keys.length === 0) {
      return undefined;
    }
    let anchorMs = Number.POSITIVE_INFINITY;
    for (const key of keys) {
      const t = Date.parse(this._recordingStarts[key]!.startedAt);
      if (Number.isFinite(t) && t < anchorMs) {
        anchorMs = t;
      }
    }
    const anchorStartedAt = Number.isFinite(anchorMs)
      ? new Date(anchorMs).toISOString()
      : (this._recordingStarts[keys[0]!]!.startedAt);

    const devices: Record<
      string,
      { startedAt: string; filePath?: string; completedAt?: string }
    > = {};
    for (const key of keys) {
      devices[key] = {
        startedAt: this._recordingStarts[key]!.startedAt,
        filePath:
          this._recordingStops[key]?.filePath ??
          this._recordingStarts[key]!.filePath,
        completedAt: this._recordingStops[key]?.completedAt,
      };
    }
    return { anchorStartedAt, devices };
  }
}

/** Append a short history line. Keeps formatting consistent with single-device
 *  history emission patterns. */
function appendHistory(
  history: string,
  iteration: number,
  device: string,
  action: string,
  outcome: string,
): string {
  const line = `[iter ${iteration} · ${device}] ${action} — ${outcome}`;
  return history.length === 0 ? line : `${history}\n${line}`;
}
