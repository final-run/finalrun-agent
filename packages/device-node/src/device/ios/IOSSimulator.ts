import {
  DeviceNodeResponse,
  Logger,
  type BackAction,
  type CheckAppInForegroundAction,
  type DeeplinkAction,
  type DeviceAppInfo,
  type EraseTextAction,
  type EnterTextAction,
  type GetHierarchyAction,
  type GetScreenshotAction,
  type HideKeyboardAction,
  type HomeAction,
  type KillAppAction,
  type LaunchAppAction,
  type LongPressAction,
  type PressKeyAction,
  type RotateAction,
  type ScrollAbsAction,
  type SetLocationAction,
  type SwitchToPrimaryAppAction,
  type TapAction,
  type TapPercentAction,
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

  async tapPercent(action: TapPercentAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.tapPercent(action);
  }

  async longPress(action: LongPressAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.longPress(action);
  }

  async enterText(action: EnterTextAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.enterText(action);
  }

  async eraseText(action: EraseTextAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.eraseText(action);
  }

  async scrollAbs(action: ScrollAbsAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.swipe(action);
  }

  async back(_action: BackAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.back();
  }

  async home(_action: HomeAction): Promise<DeviceNodeResponse> {
    return this._toResponse(
      await this._simctlClient.pressButton(this._deviceId, 'home'),
    );
  }

  async rotate(action: RotateAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.rotate(action);
  }

  async hideKeyboard(_action: HideKeyboardAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.hideKeyboard();
  }

  async pressKey(action: PressKeyAction): Promise<DeviceNodeResponse> {
    const physicalButton = this._getPhysicalButtonForKey(action.key);
    if (physicalButton) {
      return this._toResponse(
        await this._simctlClient.pressButton(this._deviceId, physicalButton),
      );
    }

    return await this._commonDriverActions.pressKey(action);
  }

  async launchApp(action: LaunchAppAction): Promise<DeviceNodeResponse> {
    try {
      await this.refreshInstalledAppIds({ throwOnFailure: false });
    } catch (error) {
      Logger.w('Failed to refresh iOS app IDs before launch:', error);
    }

    if (action.stopAppBeforeLaunch) {
      const terminateResult = await this._simctlClient.terminateAppResult(
        this._deviceId,
        action.appUpload.packageName,
      );
      if (!terminateResult.success) {
        return this._toResponse(terminateResult);
      }
    }

    if (action.clearState) {
      return new DeviceNodeResponse({
        success: false,
        message:
          'iOS clearState is not supported in finalrun-ts without an install artifact path for reinstall.',
      });
    }

    if (action.allowAllPermissions) {
      const permissionsResult = await this._simctlClient.allowAllPermissions(
        this._deviceId,
        action.appUpload.packageName,
      );
      if (!permissionsResult.success) {
        return this._toResponse(permissionsResult);
      }
    } else if (Object.keys(action.permissions).length > 0) {
      const permissionsResult = await this._simctlClient.togglePermissions(
        this._deviceId,
        action.appUpload.packageName,
        action.permissions,
      );
      if (!permissionsResult.success) {
        return this._toResponse(permissionsResult);
      }
    }

    return await this._commonDriverActions.launchApp(action);
  }

  async killApp(action: KillAppAction): Promise<DeviceNodeResponse> {
    return this._toResponse(
      await this._simctlClient.terminateAppResult(
        this._deviceId,
        action.packageName,
      ),
    );
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
    return this._toResponse(
      await this._simctlClient.setLocation(
        this._deviceId,
        action.lat,
        action.long,
      ),
    );
  }

  async switchToPrimaryApp(
    action: SwitchToPrimaryAppAction,
  ): Promise<DeviceNodeResponse> {
    return this._toResponse(
      await this._simctlClient.bringAppToForeground(
        this._deviceId,
        action.packageName,
      ),
    );
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

  async getScreenshot(action: GetScreenshotAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.getScreenshot(action);
  }

  async getHierarchy(action: GetHierarchyAction): Promise<DeviceNodeResponse> {
    return await this._commonDriverActions.getHierarchy(action);
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

  private _getPhysicalButtonForKey(key: string): string | null {
    const normalizedKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (normalizedKey) {
      case 'home':
      case 'menu':
        return 'home';
      case 'lock':
      case 'power':
        return 'lock';
      case 'volume_up':
      case 'volumeup':
        return 'volumeup';
      case 'volume_down':
      case 'volumedown':
        return 'volumedown';
      default:
        return null;
    }
  }

  private _toResponse(result: {
    success: boolean;
    message?: string;
    data?: Record<string, unknown>;
  }): DeviceNodeResponse {
    return new DeviceNodeResponse({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  }
}
