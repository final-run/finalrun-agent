import {
  DeviceNodeResponse,
  Logger,
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
import {
  IOS_DRIVER_RUNNER_BUNDLE_ID,
  type SimctlClient,
} from '../../infra/ios/SimctlClient.js';
import { CommonDriverActions } from '../shared/CommonDriverActions.js';
import type {
  DeviceRuntime,
  DeviceScreenshotAndHierarchy,
} from '../shared/DeviceRuntime.js';

export class IOSSimulator implements DeviceRuntime {
  private _commonDriverActions: CommonDriverActions;
  private _simctlClient: SimctlClient;
  private _deviceId: string;

  constructor(params: {
    commonDriverActions: CommonDriverActions;
    simctlClient: SimctlClient;
    deviceId: string;
  }) {
    this._commonDriverActions = params.commonDriverActions;
    this._simctlClient = params.simctlClient;
    this._deviceId = params.deviceId;
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
    return await this._commonDriverActions.swipe(action);
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
    try {
      await this.refreshInstalledAppIds({ throwOnFailure: false });
    } catch (error) {
      Logger.w('Failed to refresh iOS app IDs before launch:', error);
    }

    return await this._commonDriverActions.launchApp(action);
  }

  async killApp(action: KillAppAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.killApp(action.packageName);
  }

  async openDeepLink(action: DeeplinkAction): Promise<DeviceNodeResponse> {
    const opened = await this._simctlClient.openUrl(this._deviceId, action.deeplink);
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
    const apps = await this.getInstalledApps();
    return new DeviceNodeResponse({
      success: true,
      data: {
        apps: apps.map((app) => app.toJson()),
      },
    });
  }

  async getInstalledApps(): Promise<DeviceAppInfo[]> {
    return await this._simctlClient.listInstalledApps(this._deviceId);
  }

  async getScreenshotAndHierarchy(): Promise<DeviceScreenshotAndHierarchy> {
    return await this._commonDriverActions.getScreenshotAndHierarchy();
  }

  async refreshInstalledAppIds(
    options: { throwOnFailure: boolean },
  ): Promise<void> {
    const appIds = await this._simctlClient.listInstalledAppIds(this._deviceId);
    Logger.i(`Sending ${appIds.length} iOS app IDs to driver...`);
    const updateResponse = await this._commonDriverActions.updateAppIds(appIds);
    if (updateResponse.success) {
      return;
    }

    const message =
      `Failed to update iOS app IDs: ${updateResponse.message ?? 'unknown error'}`;
    if (options.throwOnFailure) {
      throw new Error(message);
    }
    Logger.w(message);
  }

  async close(): Promise<void> {
    try {
      await this._simctlClient.terminateApp(this._deviceId, IOS_DRIVER_RUNNER_BUNDLE_ID);
    } finally {
      this._commonDriverActions.close();
    }
  }

  killDriver(): void {
    this._commonDriverActions.killDriver();
  }
}
