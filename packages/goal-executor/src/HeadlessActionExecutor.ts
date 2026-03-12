// Port of goal_executor/lib/src/HeadlessActionExecutor.dart
// Executes individual device actions: ground → coordinates → execute on device.

import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
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
  PLANNER_ACTION_HIDE_KEYBOARD,
  PLANNER_ACTION_PRESS_ENTER,
  PLANNER_ACTION_LAUNCH_APP,
  PLANNER_ACTION_SET_LOCATION,
  PLANNER_ACTION_WAIT,
  PLANNER_ACTION_DEEPLINK,
} from '@finalrun/common';
import { AIAgent } from './ai/AIAgent.js';
import { VisualGrounder } from './ai/VisualGrounder.js';
import { GrounderResponseConverter, ConversionResult } from './GrounderResponseConverter.js';

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
}

export interface ActionOutput {
  success: boolean;
  error?: string;
}

// ============================================================================
// HeadlessActionExecutor
// ============================================================================

/**
 * Executes individual actions: ground UI element → compute coordinates → device action.
 *
 * Dart equivalent: HeadlessActionExecutor in goal_executor/lib/src/HeadlessActionExecutor.dart
 */
export class HeadlessActionExecutor {
  private _agent: Agent;
  private _aiAgent: AIAgent;
  private _visualGrounder: VisualGrounder;
  private _platform: string;

  constructor(params: { agent: Agent; aiAgent: AIAgent; platform: string }) {
    this._agent = params.agent;
    this._aiAgent = params.aiAgent;
    this._visualGrounder = new VisualGrounder(params.aiAgent);
    this._platform = params.platform;
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
          return await this._executeSimpleAction(new BackAction());

        case PLANNER_ACTION_HOME:
          return await this._executeSimpleAction(new HomeAction());

        case PLANNER_ACTION_HIDE_KEYBOARD:
          return await this._executeSimpleAction(new HideKeyboardAction());

        case PLANNER_ACTION_PRESS_ENTER:
          return await this._executePressEnter();

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
      const msg = error instanceof Error ? error.message : String(error);
      Logger.e(`Action ${input.action} failed:`, error);
      return { success: false, error: msg };
    }
  }

  // ============================== Action Handlers ==============================

  /**
   * Tap action: ground element → get coordinates → tap.
   * Dart: Future<void> _executeTap(...)
   */
  private async _executeTap(input: ActionInput): Promise<ActionOutput> {
    const pointResult = await this._groundToPoint(input, FEATURE_GROUNDER);
    if (!pointResult.success || !pointResult.data) {
      // Check for visual grounding fallback
      if (pointResult.error === 'needsVisualGrounding') {
        return await this._executeVisualGroundingFallback(input, 'tap');
      }
      return { success: false, error: pointResult.error ?? 'Grounding failed' };
    }

    const point = pointResult.data;
    const repeatCount = Math.max(1, input.repeat ?? 1);
    const delayBetweenTapMs = input.delayBetweenTapMs ?? 500;

    for (let index = 0; index < repeatCount; index++) {
      const action = new TapAction({
        point: new Point({ x: point.x, y: point.y }),
      });
      const result = await this._executeDeviceAction(action);
      if (!result.success) {
        return result;
      }

      if (index < repeatCount - 1) {
        await this._delay(delayBetweenTapMs);
      }
    }

    return { success: true };
  }

  /**
   * Long press action: ground element → get coordinates → long press.
   */
  private async _executeLongPress(input: ActionInput): Promise<ActionOutput> {
    const pointResult = await this._groundToPoint(input, FEATURE_GROUNDER);
    if (!pointResult.success || !pointResult.data) {
      if (pointResult.error === 'needsVisualGrounding') {
        return await this._executeVisualGroundingFallback(input, 'longPress');
      }
      return { success: false, error: pointResult.error ?? 'Grounding failed' };
    }

    const point = pointResult.data;
    const action = new LongPressAction({ point: new Point({ x: point.x, y: point.y }) });
    return await this._executeDeviceAction(action);
  }

  /**
   * Type/input text action:
   * 1. Ground the input field using input-focus grounder
   * 2. If field is not focused, tap it first
   * 3. Enter the text
   */
  private async _executeType(input: ActionInput): Promise<ActionOutput> {
    const textMatch = input.reason.match(/"([^"]*)"/) ?? input.reason.match(/'([^']*)'/);
    const textToType = input.text ?? (textMatch ? textMatch[1] : input.reason);

    // First, ground the input field using input-focus grounder
    const focusResult = await this._groundToPoint(input, FEATURE_INPUT_FOCUS_GROUNDER);

    if (focusResult.success && focusResult.data !== null && focusResult.data !== undefined) {
      // Field is NOT focused — tap it first
      const tapAction = new TapAction({
        point: new Point({ x: focusResult.data.x, y: focusResult.data.y }),
      });
      const tapResult = await this._executeDeviceAction(tapAction);
      if (!tapResult.success) {
        return tapResult;
      }
      // Small delay after tap
      await this._delay(300);
    }
    // data === null means field is already focused — skip tap

    // Now enter the text
    const action = new EnterTextAction({
      value: textToType,
      shouldEraseText: input.clearText ?? true,
    });
    return await this._executeDeviceAction(action);
  }

  /**
   * Scroll action: call scroll-index grounder → get scroll vector → swipe.
   */
  private async _executeScroll(input: ActionInput): Promise<ActionOutput> {
    const act =
      input.reason.trim() ||
      (input.direction ? `Swipe ${input.direction}` : 'Scroll the current view.');

    const grounderResponse = await this._aiAgent.ground({
      feature: FEATURE_SCROLL_INDEX_GROUNDER,
      act,
      hierarchy: input.hierarchy,
      screenshot: input.screenshot,
      platform: this._platform,
    });

    const scrollResult = GrounderResponseConverter.extractScrollAction({
      output: grounderResponse.output,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
    });

    if (!scrollResult.success || !scrollResult.data) {
      return { success: false, error: scrollResult.error ?? 'Scroll grounding failed' };
    }

    return await this._executeDeviceAction(scrollResult.data);
  }

  /**
   * Press Enter key.
   */
  private async _executePressEnter(): Promise<ActionOutput> {
    const action = new PressKeyAction({ key: 'enter' });
    return await this._executeDeviceAction(action);
  }

  /**
   * Launch app: call launch-app grounder → get package name → launch.
   */
  private async _executeLaunchApp(input: ActionInput): Promise<ActionOutput> {
    // Get list of installed apps first
    const appListResponse = await this._agent.executeAction(
      new DeviceActionRequest({
        requestId: uuidv4(),
        action: new GetAppListAction(),
        timeout: 10,
      }),
    );

    const apps = appListResponse.data
      ? ((appListResponse.data['apps'] as Array<{ packageName: string; name: string }>) ?? [])
      : [];

    // Call launch-app grounder
    const grounderResponse = await this._aiAgent.ground({
      feature: FEATURE_LAUNCH_APP_GROUNDER,
      act: input.reason,
      platform: this._platform,
      availableApps: apps,
    });

    const output = grounderResponse.output;

    if (output['isError']) {
      return { success: false, error: output['reason'] as string };
    }

    const packageName = output['packageName'] as string;
    if (!packageName) {
      return { success: false, error: 'Launch app grounder did not return packageName' };
    }

    const action = new LaunchAppAction({
      appUpload: new AppUpload({ id: '', platform: this._platform, packageName }),
      allowAllPermissions: (output['allowAllPermissions'] as boolean) ?? true,
      shouldUninstallBeforeLaunch: (output['shouldUninstallBeforeLaunch'] as boolean) ?? true,
      clearState: (output['clearState'] as boolean) ?? false,
      stopAppBeforeLaunch: (output['stopAppBeforeLaunch'] as boolean) ?? false,
      permissions: (output['permissions'] as Record<string, string>) ?? {},
    });

    return await this._executeDeviceAction(action);
  }

  /**
   * Set location: call set-location grounder → get lat/long → set.
   */
  private async _executeSetLocation(input: ActionInput): Promise<ActionOutput> {
    const grounderResponse = await this._aiAgent.ground({
      feature: FEATURE_SET_LOCATION_GROUNDER,
      act: input.reason,
    });

    const output = grounderResponse.output;

    if (output['isError']) {
      return { success: false, error: output['reason'] as string };
    }

    const lat = output['lat'] as string;
    const long = output['long'] as string;

    if (!lat || !long) {
      return { success: false, error: 'Set location grounder did not return coordinates' };
    }

    const action = new SetLocationAction({ lat: lat.trim(), long: long.trim() });
    return await this._executeDeviceAction(action);
  }

  /**
   * Wait action — pause for the planner-requested duration or a short default.
   */
  private async _executeWait(input: ActionInput): Promise<ActionOutput> {
    const durationSeconds = input.durationSeconds ?? 3;
    Logger.d(`Waiting ${durationSeconds} seconds...`);
    await this._delay(Math.max(0, Math.round(durationSeconds * 1000)));
    return { success: true };
  }

  /**
   * Deeplink action: extract URL from reason and open it.
   */
  private async _executeDeeplink(input: ActionInput): Promise<ActionOutput> {
    const deeplink =
      input.url ??
      input.reason.match(/(https?:\/\/\S+|[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+)/)?.[1];
    if (!deeplink) {
      return { success: false, error: 'Could not extract deeplink URL from reason' };
    }

    const action = new DeeplinkAction({ deeplink });
    return await this._executeDeviceAction(action);
  }

  /**
   * Simple action (back, home, hideKeyboard) — no grounding needed.
   */
  private async _executeSimpleAction(action: BackAction | HomeAction | HideKeyboardAction): Promise<ActionOutput> {
    return await this._executeDeviceAction(action);
  }

  // ============================== Helpers ==============================

  /**
   * Ground an element and extract coordinates.
   */
  private async _groundToPoint(
    input: ActionInput,
    feature: string,
  ): Promise<ConversionResult<Point | null>> {
    const grounderResponse = await this._aiAgent.ground({
      feature,
      act: input.reason,
      hierarchy: input.hierarchy,
      screenshot: input.screenshot,
      platform: this._platform,
    });

    return GrounderResponseConverter.extractPoint({
      output: grounderResponse.output,
      flattenedHierarchy: input.hierarchy?.flattenedHierarchy ?? [],
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
    });
  }

  /**
   * Visual grounding fallback — called when needsVisualGrounding is returned.
   * Makes one attempt to find coordinates from the screenshot alone.
   */
  private async _executeVisualGroundingFallback(
    input: ActionInput,
    actionType: 'tap' | 'longPress',
  ): Promise<ActionOutput> {
    if (!input.screenshot) {
      return { success: false, error: 'needsVisualGrounding but no screenshot available' };
    }

    const result = await this._visualGrounder.ground({
      act: input.reason,
      screenshot: input.screenshot,
      platform: this._platform,
    });

    if (!result.success || result.x === undefined || result.y === undefined) {
      return { success: false, error: `Visual grounding failed: ${result.reason}` };
    }

    const point = new Point({ x: result.x, y: result.y });
    const action = actionType === 'longPress'
      ? new LongPressAction({ point })
      : new TapAction({ point });

    return await this._executeDeviceAction(action);
  }

  /**
   * Execute a device action via the Agent.
   */
  private async _executeDeviceAction(action: TapAction | LongPressAction | EnterTextAction | ScrollAbsAction | BackAction | HomeAction | HideKeyboardAction | PressKeyAction | LaunchAppAction | DeeplinkAction | SetLocationAction | WaitAction): Promise<ActionOutput> {
    const response = await this._agent.executeAction(
      new DeviceActionRequest({
        requestId: uuidv4(),
        action,
        timeout: 30,
      }),
    );

    if (response.success) {
      return { success: true };
    } else {
      return { success: false, error: response.message ?? 'Action failed' };
    }
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
