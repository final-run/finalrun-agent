// Port of common/model/TestStep.dart -- a focused subset used by the CLI,
// device-node runtime, and transport parity layers.

import { AppUpload } from './AppUpload.js';
import { SingleArgument } from './SingleArgument.js';

// ============================================================================
// Point & PointPercent -- used by GrounderResponseConverter and actions
// ============================================================================

/**
 * Dart equivalent: Point class in TestStep.dart (lines 146-174)
 */
export class Point {
  readonly x: number;
  readonly y: number;

  constructor(params: { x: number; y: number }) {
    this.x = params.x;
    this.y = params.y;
  }

  static fromJson(json: Record<string, unknown>): Point {
    return new Point({
      x: json['x'] as number,
      y: json['y'] as number,
    });
  }

  toJson(): Record<string, unknown> {
    return { x: this.x, y: this.y };
  }
}

/**
 * Percent-based point coordinates.
 * Dart: PointPercent class in TestStep.dart
 */
export class PointPercent {
  readonly xPercent: number;
  readonly yPercent: number;

  constructor(params: { xPercent: number; yPercent: number }) {
    this.xPercent = params.xPercent;
    this.yPercent = params.yPercent;
  }

  static fromJson(json: Record<string, unknown>): PointPercent {
    return new PointPercent({
      xPercent: json['xPercent'] as number,
      yPercent: json['yPercent'] as number,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      xPercent: this.xPercent,
      yPercent: this.yPercent,
    };
  }
}

// ============================================================================
// DeviceAction -- base class for all device actions
// Dart equivalent: abstract class StepAction in TestStep.dart
// ============================================================================

/**
 * Base class for all device actions. In Dart this is an abstract class.
 * We define action type constants as static members.
 */
export abstract class DeviceAction {
  // Dart: static const String tap = 'tap'; etc.
  static readonly TAP = 'tap';
  static readonly TAP_PERCENT = 'tapPercent';
  static readonly LONG_PRESS = 'longPress';
  static readonly ENTER_TEXT = 'enterText';
  static readonly ERASE_TEXT = 'eraseText';
  static readonly COPY_TEXT = 'copyText';
  static readonly PASTE_TEXT = 'pasteText';
  static readonly BACK = 'back';
  static readonly HOME = 'home';
  static readonly ROTATE = 'rotate';
  static readonly HIDE_KEYBOARD = 'hideKeyboard';
  static readonly KILL_APP = 'killApp';
  static readonly LAUNCH_APP = 'launchApp';
  static readonly DEEPLINK = 'deeplink';
  static readonly PRESS_KEY = 'pressKey';
  static readonly SCROLL_ABS = 'scrollAbs';
  static readonly WAIT = 'wait';
  static readonly SET_LOCATION = 'setLocation';
  static readonly SWITCH_TO_PRIMARY_APP = 'switchToPrimaryApp';
  static readonly GET_HIERARCHY = 'getHierarchy';
  static readonly GET_SCREENSHOT = 'getScreenshot';
  static readonly GET_SCREENSHOT_AND_HIERARCHY = 'getScreenshotAndHierarchy';
  static readonly GET_APP_LIST = 'getAppList';
  static readonly CHECK_APP_IN_FOREGROUND = 'checkAppInForeground';

  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  toJson(): Record<string, unknown> {
    return { type: this.type };
  }
}

// ============================================================================
// Concrete action classes -- focused subset used by the CLI + runtime parity
// ============================================================================

/**
 * Tap at absolute pixel coordinates.
 * Dart: TapAction in TestStep.dart
 */
export class TapAction extends DeviceAction {
  readonly point: Point;
  readonly repeat: number;
  readonly delay: number;

  constructor(params: { point: Point; repeat?: number; delay?: number }) {
    super(DeviceAction.TAP);
    this.point = params.point;
    this.repeat = params.repeat ?? 1;
    this.delay = params.delay ?? 0;
  }

  static fromJson(json: Record<string, unknown>): TapAction {
    return new TapAction({
      point: Point.fromJson(json['point'] as Record<string, unknown>),
      repeat: (json['repeat'] as number) ?? 1,
      delay: (json['delay'] as number) ?? 0,
    });
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      point: this.point.toJson(),
      repeat: this.repeat,
      delay: this.delay,
    };
  }
}

/**
 * Tap at percentage coordinates.
 * Dart: TapPercentAction in TestStep.dart
 */
export class TapPercentAction extends DeviceAction {
  readonly point: PointPercent;

  constructor(params: { point: PointPercent }) {
    super(DeviceAction.TAP_PERCENT);
    this.point = params.point;
  }

  static fromJson(json: Record<string, unknown>): TapPercentAction {
    return new TapPercentAction({
      point: PointPercent.fromJson(json['point'] as Record<string, unknown>),
    });
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      point: this.point.toJson(),
    };
  }
}

/**
 * Long-press at absolute pixel coordinates.
 * Dart: LongPressAction in TestStep.dart
 */
export class LongPressAction extends DeviceAction {
  readonly point: Point;

  constructor(params: { point: Point }) {
    super(DeviceAction.LONG_PRESS);
    this.point = params.point;
  }

  static fromJson(json: Record<string, unknown>): LongPressAction {
    return new LongPressAction({
      point: Point.fromJson(json['point'] as Record<string, unknown>),
    });
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      point: this.point.toJson(),
    };
  }
}

/**
 * Type text into a focused input field.
 * Dart: EnterTextAction in TestStep.dart
 */
export class EnterTextAction extends DeviceAction {
  readonly value: string;
  readonly shouldEraseText: boolean;
  readonly eraseCount: number | null;

  constructor(params: {
    value: string;
    shouldEraseText?: boolean;
    eraseCount?: number | null;
  }) {
    super(DeviceAction.ENTER_TEXT);
    this.value = params.value;
    this.shouldEraseText = params.shouldEraseText ?? false;
    this.eraseCount = params.eraseCount ?? null;
  }

  static fromJson(json: Record<string, unknown>): EnterTextAction {
    return new EnterTextAction({
      value: json['value'] as string,
      shouldEraseText: (json['shouldEraseText'] as boolean) ?? false,
      eraseCount: (json['eraseCount'] as number) ?? null,
    });
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      value: this.value,
      shouldEraseText: this.shouldEraseText,
      eraseCount: this.eraseCount,
    };
  }
}

/**
 * Erase text from the focused input field.
 * Dart: EraseTextAction in TestStep.dart
 */
export class EraseTextAction extends DeviceAction {
  constructor() {
    super(DeviceAction.ERASE_TEXT);
  }
}

/**
 * Absolute-coordinate scroll/swipe action.
 * Dart: ScrollAbsAction in TestStep.dart
 */
export class ScrollAbsAction extends DeviceAction {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly durationMs: number;

  constructor(params: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    durationMs?: number;
  }) {
    super(DeviceAction.SCROLL_ABS);
    this.startX = params.startX;
    this.startY = params.startY;
    this.endX = params.endX;
    this.endY = params.endY;
    this.durationMs = params.durationMs ?? 500;
  }

  static fromJson(json: Record<string, unknown>): ScrollAbsAction {
    return new ScrollAbsAction({
      startX: json['startX'] as number,
      startY: json['startY'] as number,
      endX: json['endX'] as number,
      endY: json['endY'] as number,
      durationMs: (json['durationMs'] as number) ?? 500,
    });
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      startX: this.startX,
      startY: this.startY,
      endX: this.endX,
      endY: this.endY,
      durationMs: this.durationMs,
    };
  }
}

/**
 * Press the system Back button (Android) / swipe-back (iOS).
 * Dart: BackAction in TestStep.dart
 */
export class BackAction extends DeviceAction {
  constructor() {
    super(DeviceAction.BACK);
  }
}

/**
 * Press the system Home button.
 * Dart: HomeAction in TestStep.dart
 */
export class HomeAction extends DeviceAction {
  constructor() {
    super(DeviceAction.HOME);
  }
}

/**
 * Rotate device orientation.
 * Dart: RotateAction in TestStep.dart
 */
export class RotateAction extends DeviceAction {
  constructor() {
    super(DeviceAction.ROTATE);
  }
}

/**
 * Hide the software keyboard.
 * Dart: HideKeyboardAction in TestStep.dart
 */
export class HideKeyboardAction extends DeviceAction {
  constructor() {
    super(DeviceAction.HIDE_KEYBOARD);
  }
}

/**
 * Press a named key (e.g., 'enter', 'tab').
 * Dart: PressKeyAction in TestStep.dart
 */
export class PressKeyAction extends DeviceAction {
  readonly key: string;

  constructor(params: { key: string }) {
    super(DeviceAction.PRESS_KEY);
    this.key = params.key;
  }

  static fromJson(json: Record<string, unknown>): PressKeyAction {
    return new PressKeyAction({ key: json['key'] as string });
  }

  override toJson(): Record<string, unknown> {
    return { ...super.toJson(), key: this.key };
  }
}

/**
 * Launch an app on the device.
 * Dart: LaunchAppAction in TestStep.dart
 */
export class LaunchAppAction extends DeviceAction {
  readonly appUpload: AppUpload;
  readonly allowAllPermissions: boolean;
  readonly shouldUninstallBeforeLaunch: boolean;
  readonly clearState: boolean;
  readonly stopAppBeforeLaunch: boolean;
  readonly arguments: Record<string, SingleArgument>;
  readonly permissions: Record<string, string>;

  constructor(params: {
    appUpload: AppUpload;
    allowAllPermissions?: boolean;
    shouldUninstallBeforeLaunch?: boolean;
    clearState?: boolean;
    stopAppBeforeLaunch?: boolean;
    arguments?: Record<string, SingleArgument>;
    permissions?: Record<string, string>;
  }) {
    super(DeviceAction.LAUNCH_APP);
    this.appUpload = params.appUpload;
    this.allowAllPermissions = params.allowAllPermissions ?? true;
    this.shouldUninstallBeforeLaunch = params.shouldUninstallBeforeLaunch ?? true;
    this.clearState = params.clearState ?? false;
    this.stopAppBeforeLaunch = params.stopAppBeforeLaunch ?? false;
    this.arguments = params.arguments ?? {};
    this.permissions = params.permissions ?? {};
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      appUpload: {
        id: this.appUpload.id,
        platform: this.appUpload.platform,
        packageName: this.appUpload.packageName,
      },
      allowAllPermissions: this.allowAllPermissions,
      shouldUninstallBeforeLaunch: this.shouldUninstallBeforeLaunch,
      clearState: this.clearState,
      stopAppBeforeLaunch: this.stopAppBeforeLaunch,
      arguments: this.arguments,
      permissions: this.permissions,
    };
  }
}

/**
 * Open a deeplink URL on the device.
 * Dart: DeeplinkAction in TestStep.dart
 */
export class DeeplinkAction extends DeviceAction {
  readonly deeplink: string;

  constructor(params: { deeplink: string }) {
    super(DeviceAction.DEEPLINK);
    this.deeplink = params.deeplink;
  }

  static fromJson(json: Record<string, unknown>): DeeplinkAction {
    return new DeeplinkAction({ deeplink: json['deeplink'] as string });
  }

  override toJson(): Record<string, unknown> {
    return { ...super.toJson(), deeplink: this.deeplink };
  }
}

/**
 * Set the device's GPS location.
 * Dart: SetLocationAction in TestStep.dart
 */
export class SetLocationAction extends DeviceAction {
  readonly lat: string;
  readonly long: string;

  constructor(params: { lat: string; long: string }) {
    super(DeviceAction.SET_LOCATION);
    this.lat = params.lat;
    this.long = params.long;
  }

  static fromJson(json: Record<string, unknown>): SetLocationAction {
    return new SetLocationAction({
      lat: json['lat'] as string,
      long: json['long'] as string,
    });
  }

  override toJson(): Record<string, unknown> {
    return { ...super.toJson(), lat: this.lat, long: this.long };
  }
}

/**
 * Wait/pause for a duration.
 * Dart: WaitAction in TestStep.dart
 */
export class WaitAction extends DeviceAction {
  constructor() {
    super(DeviceAction.WAIT);
  }
}

/**
 * Request screenshot + hierarchy from the device.
 * Dart: GetScreenshotAndHierarchyAction in TestStep.dart
 */
export class GetScreenshotAndHierarchyAction extends DeviceAction {
  constructor() {
    super(DeviceAction.GET_SCREENSHOT_AND_HIERARCHY);
  }
}

/**
 * Request the current device screenshot.
 * Dart: GetScreenshotAction in TestStep.dart
 */
export class GetScreenshotAction extends DeviceAction {
  constructor() {
    super(DeviceAction.GET_SCREENSHOT);
  }
}

/**
 * Request the current device hierarchy.
 * Dart: GetHierarchyAction in TestStep.dart
 */
export class GetHierarchyAction extends DeviceAction {
  constructor() {
    super(DeviceAction.GET_HIERARCHY);
  }
}

/**
 * Request the list of installed apps from the device.
 * Dart: GetAppListAction in TestStep.dart
 */
export class GetAppListAction extends DeviceAction {
  constructor() {
    super(DeviceAction.GET_APP_LIST);
  }
}

/**
 * Kill a running app.
 * Dart: KillAppAction in TestStep.dart
 */
export class KillAppAction extends DeviceAction {
  readonly packageName: string;

  constructor(params: { packageName: string }) {
    super(DeviceAction.KILL_APP);
    this.packageName = params.packageName;
  }

  static fromJson(json: Record<string, unknown>): KillAppAction {
    return new KillAppAction({
      packageName: json['packageName'] as string,
    });
  }

  override toJson(): Record<string, unknown> {
    return { ...super.toJson(), packageName: this.packageName };
  }
}

/**
 * Switch to the primary app.
 * Dart: SwitchToPrimaryAppAction in TestStep.dart
 */
export class SwitchToPrimaryAppAction extends DeviceAction {
  readonly packageName: string;

  constructor(params: { packageName: string }) {
    super(DeviceAction.SWITCH_TO_PRIMARY_APP);
    this.packageName = params.packageName;
  }

  override toJson(): Record<string, unknown> {
    return { ...super.toJson(), packageName: this.packageName };
  }
}

/**
 * Check if an app is in the foreground.
 * Dart: CheckAppInForegroundAction in TestStep.dart
 */
export class CheckAppInForegroundAction extends DeviceAction {
  readonly packageName: string;
  readonly timeoutSeconds: number;

  constructor(params: { packageName: string; timeoutSeconds?: number }) {
    super(DeviceAction.CHECK_APP_IN_FOREGROUND);
    this.packageName = params.packageName;
    this.timeoutSeconds = params.timeoutSeconds ?? 10;
  }

  override toJson(): Record<string, unknown> {
    return {
      ...super.toJson(),
      packageName: this.packageName,
      timeoutSeconds: this.timeoutSeconds,
    };
  }
}
