import {
  DeviceNodeResponse,
  type BackAction,
  type CheckAppInForegroundAction,
  type DeeplinkAction,
  type DeviceAppInfo,
  type EnterTextAction,
  type HideKeyboardAction,
  type HomeAction,
  type KillAppAction,
  type LaunchAppAction,
  type LongPressAction,
  type PressKeyAction,
  type ScrollAbsAction,
  type SetLocationAction,
  type SwitchToPrimaryAppAction,
  type TapAction,
} from '@finalrun/common';
import type { AdbClient } from '../../infra/android/AdbClient.js';
import { CommonDriverActions } from '../shared/CommonDriverActions.js';
import type {
  DeviceRuntime,
  DeviceScreenshotAndHierarchy,
} from '../shared/DeviceRuntime.js';

export class AndroidDevice implements DeviceRuntime {
  private _commonDriverActions: CommonDriverActions;
  private _adbClient: AdbClient;
  private _adbPath: string;
  private _deviceSerial: string;

  constructor(params: {
    commonDriverActions: CommonDriverActions;
    adbClient: AdbClient;
    adbPath: string;
    deviceSerial: string;
  }) {
    this._commonDriverActions = params.commonDriverActions;
    this._adbClient = params.adbClient;
    this._adbPath = params.adbPath;
    this._deviceSerial = params.deviceSerial;
  }

  setShouldEnsureStability(shouldEnsureStability: boolean | undefined): void {
    this._commonDriverActions.setShouldEnsureStability(shouldEnsureStability);
  }

  isConnected(): boolean {
    return this._commonDriverActions.isConnected();
  }

  async tap(action: TapAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.tap(action);
  }

  async longPress(action: LongPressAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.longPress(action);
  }

  async enterText(action: EnterTextAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.enterText(action);
  }

  async scrollAbs(action: ScrollAbsAction): Promise<DeviceNodeResponse> {
    const response = await this._adbClient.swipe(this._adbPath, this._deviceSerial, {
      startX: action.startX,
      startY: action.startY,
      endX: action.endX,
      endY: action.endY,
      durationMs: action.durationMs,
    });
    return new DeviceNodeResponse({
      success: response.success,
      message: response.message,
    });
  }

  async back(_action: BackAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.back();
  }

  async home(_action: HomeAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.home();
  }

  async hideKeyboard(_action: HideKeyboardAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.hideKeyboard();
  }

  async pressKey(action: PressKeyAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.pressKey(action);
  }

  async launchApp(action: LaunchAppAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.launchApp(action);
  }

  async killApp(action: KillAppAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.killApp(action.packageName);
  }

  async openDeepLink(action: DeeplinkAction): Promise<DeviceNodeResponse> {
    const opened = await this._adbClient.openDeepLink(
      this._adbPath,
      this._deviceSerial,
      action.deeplink,
    );
    return new DeviceNodeResponse({
      success: opened,
      message: opened
        ? `Successfully opened deep link: ${action.deeplink}`
        : `Failed to open deep link: ${action.deeplink}`,
    });
  }

  async setLocation(action: SetLocationAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.setLocation(action);
  }

  async switchToPrimaryApp(
    action: SwitchToPrimaryAppAction,
  ): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.switchToPrimaryApp(action);
  }

  async checkAppInForeground(
    action: CheckAppInForegroundAction,
  ): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.checkAppInForeground(action);
  }

  async captureState(traceStep?: number | null): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.captureState(traceStep);
  }

  async getInstalledAppsResponse(): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.getInstalledAppsResponseFromDriver();
  }

  async getInstalledApps(): Promise<DeviceAppInfo[]> {
    return await this._commonDriverActions.getInstalledAppsFromDriver();
  }

  async getScreenshotAndHierarchy(): Promise<DeviceScreenshotAndHierarchy> {
    return await this._commonDriverActions.getScreenshotAndHierarchy();
  }

  async close(): Promise<void> {
    try {
      await this._adbClient.removePortForward(this._adbPath, this._deviceSerial);
    } finally {
      this._commonDriverActions.close();
    }
  }

  killDriver(): void {
    this._commonDriverActions.killDriver();
  }
}
