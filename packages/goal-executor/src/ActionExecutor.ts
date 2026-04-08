// Executes individual device actions: ground → coordinates → execute on device.

import { v4 as uuidv4 } from 'uuid';
import {
  DeviceAgent,
  Hierarchy,
  DeviceActionRequest,
  Logger,
  Point,
  TapAction,
  LongPressAction,
  EnterTextAction,
  ScrollAbsAction,
  BackAction,
  HomeAction,
  RotateAction,
  HideKeyboardAction,
  PressKeyAction,
  LaunchAppAction,
  DeeplinkAction,
  SetLocationAction,
  WaitAction,
  AppUpload,
  GetAppListAction,
  FEATURE_GROUNDER,
  FEATURE_SCROLL_INDEX_GROUNDER,
  FEATURE_INPUT_FOCUS_GROUNDER,
  FEATURE_LAUNCH_APP_GROUNDER,
  FEATURE_SET_LOCATION_GROUNDER,
  PLANNER_ACTION_TAP,
  PLANNER_ACTION_LONG_PRESS,
  PLANNER_ACTION_TYPE,
  PLANNER_ACTION_SCROLL,
  PLANNER_ACTION_BACK,
  PLANNER_ACTION_HOME,
  PLANNER_ACTION_ROTATE,
  PLANNER_ACTION_HIDE_KEYBOARD,
  PLANNER_ACTION_PRESS_ENTER,
  PLANNER_ACTION_LAUNCH_APP,
  PLANNER_ACTION_SET_LOCATION,
  PLANNER_ACTION_WAIT,
  PLANNER_ACTION_DEEPLINK,
  type RuntimeBindings,
  redactResolvedValue,
  resolveRuntimePlaceholders,
} from '@finalrun/common';
import { AIAgent } from './ai/AIAgent.js';
import { VisualGrounder } from './ai/VisualGrounder.js';
import {
  type TerminalFailureSignal,
  terminalFailureFromError,
} from './ai/providerFailure.js';
import { GrounderResponseConverter, ConversionResult } from './GrounderResponseConverter.js';
import {
  describeLLMTrace,
  finishTracePhase,
  nowMs,
  roundDuration,
  startTracePhase,
  type LLMTrace,
  type SpanTiming,
  type TimingMetadata,
  type TraceStatus,
} from './trace.js';

// ============================================================================
// Types
// ============================================================================

export interface ActionInput {
  action: string;
  reason: string;
  text?: string;
  clearText?: boolean;
  direction?: string;
  durationSeconds?: number;
  url?: string;
  repeat?: number;
  delayBetweenTapMs?: number;
  screenshot?: string;
  hierarchy?: Hierarchy;
  screenWidth: number;
  screenHeight: number;
  traceStep?: number;
}

export interface ActionOutput {
  success: boolean;
  error?: string;
  trace?: TimingMetadata;
  terminalFailure?: TerminalFailureSignal;
}

interface GroundToPointResult {
  result: ConversionResult<Point | null>;
  trace?: LLMTrace;
  detail?: string;
}

class TimedActionPhaseFailure extends Error {
  readonly span: SpanTiming;

  constructor(message: string, span: SpanTiming, cause?: unknown) {
    super(message);
    this.name = 'TimedActionPhaseFailure';
    this.span = span;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

// ============================================================================
// ActionExecutor
// ============================================================================

/**
 * Executes individual actions: ground UI element → compute coordinates → device action.
 *
 */
export class ActionExecutor {
  private _agent: DeviceAgent;
  private _aiAgent: AIAgent;
  private _visualGrounder: VisualGrounder;
  private _platform: string;
  private _appIdentifier?: string;
  private _runtimeBindings?: RuntimeBindings;

  constructor(params: {
    agent: DeviceAgent;
    aiAgent: AIAgent;
    platform: string;
    appIdentifier?: string;
    runtimeBindings?: RuntimeBindings;
  }) {
    this._agent = params.agent;
    this._aiAgent = params.aiAgent;
    this._visualGrounder = new VisualGrounder(params.aiAgent);
    this._platform = params.platform;
    this._appIdentifier = params.appIdentifier;
    this._runtimeBindings = params.runtimeBindings;
  }

  /**
   * Execute an action based on the planner's output.
   * Routes to the correct handler based on action type.
   */
  async executeAction(input: ActionInput): Promise<ActionOutput> {
    try {
      switch (input.action) {
        case PLANNER_ACTION_TAP:
          return await this._executeTap(input);

        case PLANNER_ACTION_LONG_PRESS:
          return await this._executeLongPress(input);

        case PLANNER_ACTION_TYPE:
          return await this._executeType(input);

        case PLANNER_ACTION_SCROLL:
          return await this._executeScroll(input);

        case PLANNER_ACTION_BACK:
          return await this._executeSimpleAction(input, new BackAction());

        case PLANNER_ACTION_HOME:
          return await this._executeSimpleAction(input, new HomeAction());

        case PLANNER_ACTION_ROTATE:
          return await this._executeSingleDevicePhase(input, new RotateAction());

        case PLANNER_ACTION_HIDE_KEYBOARD:
          return await this._executeSimpleAction(input, new HideKeyboardAction());

        case PLANNER_ACTION_PRESS_ENTER:
          return await this._executePressEnter(input);

        case PLANNER_ACTION_LAUNCH_APP:
          return await this._executeLaunchApp(input);

        case PLANNER_ACTION_SET_LOCATION:
          return await this._executeSetLocation(input);

        case PLANNER_ACTION_WAIT:
          return await this._executeWait(input);

        case PLANNER_ACTION_DEEPLINK:
          return await this._executeDeeplink(input);

        default:
          return { success: false, error: `Unknown action: ${input.action}` };
      }
    } catch (error) {
      const terminalFailure = terminalFailureFromError(error);
      if (terminalFailure) {
        Logger.e(terminalFailure.message);
      } else {
        Logger.e(`Action ${input.action} failed:`, error);
      }
      return this._failure([], error);
    }
  }

  private async _executeTap(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];

    let groundOutcome: GroundToPointResult;
    try {
      groundOutcome = await this._groundToPoint(
        input,
        FEATURE_GROUNDER,
        'action.ground',
      );
    } catch (error) {
      return this._failure(spans, error);
    }

    this._pushGroundSpan(spans, 'action.ground', groundOutcome);
    if (!groundOutcome.result.success || !groundOutcome.result.data) {
      if (groundOutcome.result.error === 'needsVisualGrounding') {
        const fallbackResult = await this._executeVisualGroundingFallback(input, 'tap');
        this._mergeTrace(spans, fallbackResult.trace);
        if (!fallbackResult.success) {
          return {
            success: false,
            error: fallbackResult.error ?? 'Visual grounding failed',
            trace: this._buildTrace(spans),
            terminalFailure: fallbackResult.terminalFailure,
          };
        }
        return this._success(spans);
      }

      return this._failure(
        spans,
        groundOutcome.result.error ?? 'Grounding failed',
      );
    }

    const point = groundOutcome.result.data;
    const repeatCount = Math.max(1, input.repeat ?? 1);
    const delayBetweenTapMs = input.delayBetweenTapMs ?? 500;

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          for (let index = 0; index < repeatCount; index++) {
            const action = new TapAction({
              point: new Point({ x: point.x, y: point.y }),
            });
            const result = await this._executeDeviceAction(action, input.traceStep);
            if (!result.success) {
              throw new Error(result.error ?? 'Tap action failed');
            }

            if (index < repeatCount - 1) {
              await this._delay(delayBetweenTapMs);
            }
          }
        },
        {
          successDetail: () =>
            `repeats=${repeatCount} delayBetweenTapMs=${delayBetweenTapMs}`,
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeLongPress(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];

    let groundOutcome: GroundToPointResult;
    try {
      groundOutcome = await this._groundToPoint(
        input,
        FEATURE_GROUNDER,
        'action.ground',
      );
    } catch (error) {
      return this._failure(spans, error);
    }

    this._pushGroundSpan(spans, 'action.ground', groundOutcome);
    if (!groundOutcome.result.success || !groundOutcome.result.data) {
      if (groundOutcome.result.error === 'needsVisualGrounding') {
        const fallbackResult = await this._executeVisualGroundingFallback(
          input,
          'longPress',
        );
        this._mergeTrace(spans, fallbackResult.trace);
        if (!fallbackResult.success) {
          return {
            success: false,
            error: fallbackResult.error ?? 'Visual grounding failed',
            trace: this._buildTrace(spans),
            terminalFailure: fallbackResult.terminalFailure,
          };
        }
        return this._success(spans);
      }

      return this._failure(
        spans,
        groundOutcome.result.error ?? 'Grounding failed',
      );
    }

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const action = new LongPressAction({
            point: new Point({
              x: groundOutcome.result.data!.x,
              y: groundOutcome.result.data!.y,
            }),
          });
          const result = await this._executeDeviceAction(action, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Long press action failed');
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeType(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];

    let textToType = '';
    let rawTextToType = '';
    try {
      const prepPhase = await this._runTimedPhase(
        input,
        'action.prep',
        async () => {
          const textMatch =
            input.reason.match(/"([^"]*)"/) ??
            input.reason.match(/'([^']*)'/);
          rawTextToType = input.text ?? (textMatch ? textMatch[1] : input.reason);
          textToType = this._runtimeBindings
            ? resolveRuntimePlaceholders(rawTextToType, this._runtimeBindings)
            : rawTextToType;
        },
        {
          successDetail: () =>
            `textLength=${rawTextToType.length} clearText=${input.clearText ?? true}`,
        },
      );
      spans.push(prepPhase.span);
    } catch (error) {
      return this._failure(spans, error);
    }

    let focusOutcome: GroundToPointResult;
    try {
      focusOutcome = await this._groundToPoint(
        input,
        FEATURE_INPUT_FOCUS_GROUNDER,
        'action.ground',
      );
    } catch (error) {
      return this._failure(spans, error);
    }

    this._pushGroundSpan(spans, 'action.ground', focusOutcome);
    if (!focusOutcome.result.success) {
      return this._failure(
        spans,
        focusOutcome.result.error ?? 'Input focus grounding failed',
      );
    }

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          if (focusOutcome.result.data !== null && focusOutcome.result.data !== undefined) {
            const tapAction = new TapAction({
              point: new Point({
                x: focusOutcome.result.data.x,
                y: focusOutcome.result.data.y,
              }),
            });
            const tapResult = await this._executeDeviceAction(tapAction, input.traceStep);
            if (!tapResult.success) {
              throw new Error(tapResult.error ?? 'Failed to focus input field');
            }
            await this._delay(300);
          }

          const action = new EnterTextAction({
            value: textToType,
            shouldEraseText: input.clearText ?? true,
          });
          const response = await this._executeDeviceAction(action, input.traceStep);
          if (!response.success) {
            throw new Error(response.error ?? 'Failed to enter text');
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeScroll(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    const act =
      input.reason.trim() ||
      (input.direction ? `Swipe ${input.direction}` : 'Scroll the current view.');

    let grounderResponse;
    try {
      grounderResponse = await this._callGrounder(input, {
        feature: FEATURE_SCROLL_INDEX_GROUNDER,
        act,
        hierarchy: input.hierarchy,
        screenshot: input.screenshot,
        platform: this._platform,
      });
    } catch (error) {
      return this._failure(spans, error);
    }

    const scrollResult = GrounderResponseConverter.extractScrollAction({
      output: grounderResponse.output,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
    });

    spans.push(
      this._llmTraceToSpan(
        'action.ground',
        grounderResponse.trace,
        scrollResult.success ? 'success' : 'failure',
        this._groundTraceDetail(
          grounderResponse.trace,
          FEATURE_SCROLL_INDEX_GROUNDER,
          scrollResult.success ? undefined : scrollResult.error ?? 'Scroll grounding failed',
        ),
      ),
    );

    if (!scrollResult.success || !scrollResult.data) {
      return this._failure(
        spans,
        scrollResult.error ?? 'Scroll grounding failed',
      );
    }

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const result = await this._executeDeviceAction(scrollResult.data!, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Scroll action failed');
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executePressEnter(input: ActionInput): Promise<ActionOutput> {
    const action = new PressKeyAction({ key: 'enter' });
    return await this._executeSingleDevicePhase(input, action);
  }

  private async _executeLaunchApp(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    let apps: Array<{ packageName: string; name: string }> = [];

    try {
      const prepPhase = await this._runTimedPhase(
        input,
        'action.prep',
        async () => {
          const appListResponse = await this._agent.executeAction(
            new DeviceActionRequest({
              requestId: uuidv4(),
              action: new GetAppListAction(),
              timeout: 10,
              traceStep: input.traceStep,
            }),
          );
          if (!appListResponse.success) {
            throw new Error(appListResponse.message ?? 'Failed to load installed apps');
          }

          apps = appListResponse.data
            ? ((appListResponse.data['apps'] as Array<{ packageName: string; name: string }>) ?? [])
            : [];
        },
        {
          successDetail: () => `appCount=${apps.length}`,
        },
      );
      spans.push(prepPhase.span);
    } catch (error) {
      return this._failure(spans, error);
    }

    let grounderResponse;
    try {
      grounderResponse = await this._callGrounder(input, {
        feature: FEATURE_LAUNCH_APP_GROUNDER,
        act: input.reason,
        platform: this._platform,
        availableApps: apps,
      });
    } catch (error) {
      return this._failure(spans, error);
    }

    const output = grounderResponse.output;
    const packageName = output['packageName'] as string;
    const grounderError =
      output['isError']
        ? (output['reason'] as string) ?? 'Launch app grounder failed'
        : !packageName
          ? 'Launch app grounder did not return packageName'
          : undefined;

    spans.push(
      this._llmTraceToSpan(
        'action.ground',
        grounderResponse.trace,
        grounderError ? 'failure' : 'success',
        this._groundTraceDetail(
          grounderResponse.trace,
          FEATURE_LAUNCH_APP_GROUNDER,
          grounderError,
        ),
      ),
    );

    if (grounderError) {
      return this._failure(spans, grounderError);
    }

    const action = new LaunchAppAction({
      appUpload: new AppUpload({ id: '', platform: this._platform, packageName }),
      allowAllPermissions: readOptionalBoolean(output, 'allowAllPermissions') ?? true,
      shouldUninstallBeforeLaunch:
        readOptionalBoolean(output, 'shouldUninstallBeforeLaunch') ??
        (packageName === this._appIdentifier ? false : true),
      clearState: readOptionalBoolean(output, 'clearState') ?? false,
      stopAppBeforeLaunch: readOptionalBoolean(output, 'stopAppBeforeLaunch') ?? false,
      permissions: (output['permissions'] as Record<string, string>) ?? {},
    });

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const result = await this._executeDeviceAction(action, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Launch app action failed');
          }
        },
        {
          successDetail: () => `package=${packageName}`,
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeSetLocation(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    let grounderResponse;

    try {
      grounderResponse = await this._callGrounder(input, {
        feature: FEATURE_SET_LOCATION_GROUNDER,
        act: input.reason,
      });
    } catch (error) {
      return this._failure(spans, error);
    }

    const output = grounderResponse.output;
    const lat = output['lat'] as string;
    const long = output['long'] as string;
    const grounderError =
      output['isError']
        ? (output['reason'] as string) ?? 'Set location grounder failed'
        : !lat || !long
          ? 'Set location grounder did not return coordinates'
          : undefined;

    spans.push(
      this._llmTraceToSpan(
        'action.ground',
        grounderResponse.trace,
        grounderError ? 'failure' : 'success',
        this._groundTraceDetail(
          grounderResponse.trace,
          FEATURE_SET_LOCATION_GROUNDER,
          grounderError,
        ),
      ),
    );

    if (grounderError) {
      return this._failure(spans, grounderError);
    }

    const action = new SetLocationAction({ lat: lat.trim(), long: long.trim() });
    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const result = await this._executeDeviceAction(action, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Set location action failed');
          }
        },
        {
          successDetail: () => `lat=${lat.trim()} long=${long.trim()}`,
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeWait(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    const durationSeconds = input.durationSeconds ?? 3;

    try {
      const waitPhase = await this._runTimedPhase(
        input,
        'action.wait',
        async () => {
          Logger.d(`Waiting ${durationSeconds} seconds...`);
          await this._delay(Math.max(0, Math.round(durationSeconds * 1000)));
        },
        {
          successDetail: () => `duration=${durationSeconds}s`,
        },
      );
      spans.push(waitPhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeDeeplink(input: ActionInput): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    let deeplink = '';
    let rawDeeplink = '';

    try {
      const prepPhase = await this._runTimedPhase(
        input,
        'action.prep',
        async () => {
          rawDeeplink =
            input.url ??
            input.reason.match(/(https?:\/\/\S+|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+)/)?.[1] ??
            '';
          if (!rawDeeplink) {
            throw new Error('Could not extract deeplink URL from reason');
          }
          deeplink = this._runtimeBindings
            ? resolveRuntimePlaceholders(rawDeeplink, this._runtimeBindings)
            : rawDeeplink;
        },
        {
          successDetail: () => `url=${rawDeeplink}`,
        },
      );
      spans.push(prepPhase.span);
    } catch (error) {
      return this._failure(spans, error);
    }

    const action = new DeeplinkAction({ deeplink });
    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const result = await this._executeDeviceAction(action, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Deeplink action failed');
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeSimpleAction(
    input: ActionInput,
    action: BackAction | HomeAction | HideKeyboardAction,
  ): Promise<ActionOutput> {
    return await this._executeSingleDevicePhase(input, action);
  }

  private async _executeSingleDevicePhase(
    input: ActionInput,
    action:
      | TapAction
      | LongPressAction
      | EnterTextAction
      | ScrollAbsAction
      | BackAction
      | HomeAction
      | RotateAction
      | HideKeyboardAction
      | PressKeyAction
      | LaunchAppAction
      | DeeplinkAction
      | SetLocationAction
      | WaitAction,
  ): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];
    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const result = await this._executeDeviceAction(action, input.traceStep);
          if (!result.success) {
            throw new Error(result.error ?? 'Device action failed');
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _groundToPoint(
    input: ActionInput,
    feature: string,
    tracePhase: string,
  ): Promise<GroundToPointResult> {
    const grounderResponse = await this._callGrounder(input, {
      feature,
      act: input.reason,
      hierarchy: input.hierarchy,
      screenshot: input.screenshot,
      platform: this._platform,
      tracePhase,
    });

    return {
      result: GrounderResponseConverter.extractPoint({
        output: grounderResponse.output,
        flattenedHierarchy: input.hierarchy?.flattenedHierarchy ?? [],
        screenWidth: input.screenWidth,
        screenHeight: input.screenHeight,
      }),
      trace: grounderResponse.trace,
      detail: this._groundTraceDetail(
        grounderResponse.trace,
        feature,
        typeof grounderResponse.output['reason'] === 'string'
          ? (grounderResponse.output['reason'] as string)
          : undefined,
      ),
    };
  }

  private async _executeVisualGroundingFallback(
    input: ActionInput,
    actionType: 'tap' | 'longPress',
  ): Promise<ActionOutput> {
    const spans: SpanTiming[] = [];

    if (!input.screenshot) {
      spans.push({
        name: 'action.visual_fallback',
        durationMs: 0,
        status: 'failure',
        detail: 'needsVisualGrounding but no screenshot available',
      });
      return {
        success: false,
        error: 'needsVisualGrounding but no screenshot available',
        trace: this._buildTrace(spans),
      };
    }

    const startedAt = nowMs();
    let result: Awaited<ReturnType<VisualGrounder['ground']>>;
    try {
      result = await this._visualGrounder.ground({
        act: input.reason,
        screenshot: input.screenshot,
        platform: this._platform,
        traceStep: input.traceStep,
      });
    } catch (error) {
      const message = this._redactRuntimeString(
        error instanceof Error ? error.message : String(error),
      );
      return this._failure(
        spans,
        new TimedActionPhaseFailure(
          message ?? 'Visual grounding failed',
          {
            name: 'action.visual_fallback',
            durationMs: roundDuration(nowMs() - startedAt),
            status: 'failure',
            detail: message,
          },
          error,
        ),
      );
    }

    spans.push(
      this._llmTraceToSpan(
        'action.visual_fallback',
        result.trace ?? {
          totalMs: roundDuration(nowMs() - startedAt),
          promptBuildMs: 0,
          llmMs: roundDuration(nowMs() - startedAt),
          parseMs: 0,
        },
        result.success && result.x !== undefined && result.y !== undefined
          ? 'success'
          : 'failure',
        result.reason,
      ),
    );

    if (!result.success || result.x === undefined || result.y === undefined) {
      return {
        success: false,
        error: `Visual grounding failed: ${result.reason}`,
        trace: this._buildTrace(spans),
      };
    }

    const point = new Point({ x: result.x, y: result.y });
    const action = actionType === 'longPress'
      ? new LongPressAction({ point })
      : new TapAction({ point });

    try {
      const devicePhase = await this._runTimedPhase(
        input,
        'action.device',
        async () => {
          const response = await this._executeDeviceAction(action, input.traceStep);
          if (!response.success) {
            throw new Error(response.error ?? `${actionType} action failed`);
          }
        },
      );
      spans.push(devicePhase.span);
      return this._success(spans);
    } catch (error) {
      return this._failure(spans, error);
    }
  }

  private async _executeDeviceAction(
    action:
      | TapAction
      | LongPressAction
      | EnterTextAction
      | ScrollAbsAction
      | BackAction
      | HomeAction
      | HideKeyboardAction
      | PressKeyAction
      | LaunchAppAction
      | DeeplinkAction
      | SetLocationAction
      | WaitAction,
    traceStep?: number,
  ): Promise<ActionOutput> {
    const response = await this._agent.executeAction(
      new DeviceActionRequest({
        requestId: uuidv4(),
        action,
        timeout: 30,
        traceStep,
      }),
    );

    if (response.success) {
      return { success: true };
    }

    return {
      success: false,
      error: response.message ?? 'Action failed',
    };
  }

  private async _callGrounder(
    input: ActionInput,
    request: {
      feature: string;
      act: string;
      hierarchy?: Hierarchy;
      screenshot?: string;
      platform?: string;
      availableApps?: Array<{ packageName: string; name: string }>;
      tracePhase?: string;
    },
  ) {
    const startedAt = nowMs();

    try {
      const response = await this._aiAgent.ground({
        ...request,
        traceStep: input.traceStep,
        tracePhase: request.tracePhase ?? 'action.ground',
      });

      return {
        ...response,
        trace:
          response.trace ??
          {
            totalMs: roundDuration(nowMs() - startedAt),
            promptBuildMs: 0,
            llmMs: roundDuration(nowMs() - startedAt),
            parseMs: 0,
          },
      };
    } catch (error) {
      const message = this._redactRuntimeString(
        error instanceof Error ? error.message : String(error),
      );
      throw new TimedActionPhaseFailure(
        message ?? 'Grounder call failed',
        {
          name: request.tracePhase ?? 'action.ground',
          durationMs: roundDuration(nowMs() - startedAt),
          status: 'failure',
          detail: message,
        },
        error,
      );
    }
  }

  private async _runTimedPhase<T>(
    input: ActionInput,
    name: string,
    fn: () => Promise<T>,
    options?: {
      startDetail?: string;
      successDetail?: (result: T) => string | undefined;
      failureDetail?: (error: unknown) => string | undefined;
    },
  ): Promise<{ result: T; span: SpanTiming }> {
    const activePhase = startTracePhase(input.traceStep, name, options?.startDetail);
    const startedAt = nowMs();

    try {
      const result = await fn();
      const detail = options?.successDetail?.(result);
      const durationMs = roundDuration(nowMs() - startedAt);
      finishTracePhase(activePhase, 'success', detail);
      return {
        result,
        span: {
          name,
          durationMs,
          status: 'success',
          detail,
        },
      };
    } catch (error) {
      const detail = this._redactRuntimeString(
        options?.failureDetail?.(error) ??
        (error instanceof Error ? error.message : String(error)),
      );
      const durationMs = roundDuration(nowMs() - startedAt);
      finishTracePhase(activePhase, 'failure', detail);
      throw new TimedActionPhaseFailure(
        detail ?? 'Action phase failed',
        {
          name,
          durationMs,
          status: 'failure',
          detail,
        },
        error,
      );
    }
  }

  private _pushGroundSpan(
    spans: SpanTiming[],
    name: string,
    groundOutcome: GroundToPointResult,
  ): void {
    spans.push(
      this._llmTraceToSpan(
        name,
        groundOutcome.trace,
        this._groundStatus(groundOutcome.result),
        groundOutcome.detail ??
          (groundOutcome.result.success ? undefined : groundOutcome.result.error ?? undefined),
      ),
    );
  }

  private _groundStatus(
    result: ConversionResult<Point | null>,
  ): TraceStatus {
    if (result.success || result.error === 'needsVisualGrounding') {
      return 'success';
    }

    return 'failure';
  }

  private _llmTraceToSpan(
    name: string,
    trace: LLMTrace | undefined,
    status: TraceStatus,
    detail?: string,
  ): SpanTiming {
    return {
      name,
      durationMs: trace?.totalMs ?? 0,
      status,
      detail: this._composeDetail(trace, detail),
    };
  }

  private _composeDetail(
    trace: LLMTrace | undefined,
    detail: string | undefined,
  ): string | undefined {
    const safeDetail = this._redactRuntimeString(detail);
    if (!trace && !detail) {
      return undefined;
    }

    if (!trace) {
      return safeDetail;
    }

    return describeLLMTrace({
      promptBuildMs: trace.promptBuildMs,
      llmMs: trace.llmMs,
      parseMs: trace.parseMs,
      extraDetail: safeDetail,
    });
  }

  private _groundTraceDetail(
    trace: LLMTrace | undefined,
    feature: string,
    reason?: string,
  ): string {
    const detail = `feature=${feature}${reason ? ` reason=${reason}` : ''}`;
    return this._composeDetail(trace, detail) ??
      this._redactRuntimeString(detail) ??
      detail;
  }

  private _success(spans: SpanTiming[]): ActionOutput {
    return {
      success: true,
      trace: this._buildTrace(spans),
    };
  }

  private _failure(
    spans: SpanTiming[],
    error: unknown,
  ): ActionOutput {
    const terminalFailure = terminalFailureFromError(error);
    if (error instanceof TimedActionPhaseFailure) {
      spans.push(error.span);
      return {
        success: false,
        error: this._redactRuntimeString(error.message) ?? error.message,
        trace: this._buildTrace(spans),
        terminalFailure,
      };
    }

    return {
      success: false,
      error: this._redactRuntimeString(
        error instanceof Error ? error.message : String(error),
      ) ?? (error instanceof Error ? error.message : String(error)),
      trace: this._buildTrace(spans),
      terminalFailure,
    };
  }

  private _buildTrace(spans: SpanTiming[]): TimingMetadata {
    return {
      totalMs: spans.reduce((sum, span) => sum + span.durationMs, 0),
      spans: spans.map((span) => ({
        ...span,
        detail: this._redactRuntimeString(span.detail),
      })),
    };
  }

  private _mergeTrace(
    spans: SpanTiming[],
    trace: TimingMetadata | undefined,
  ): void {
    if (!trace) {
      return;
    }

    spans.push(...trace.spans);
  }

  private _redactRuntimeString(value: string | undefined): string | undefined {
    if (!value || !this._runtimeBindings) {
      return value;
    }

    return redactResolvedValue(value, this._runtimeBindings);
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}
