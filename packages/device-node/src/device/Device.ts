// Port of device_node/lib/device/Device.dart
// Implements the Agent interface — bridges gRPC calls to Agent interface methods.

import {
  Agent,
  DeviceActionRequest,
  DeviceInfo,
  DeviceNodeResponse,
  DeviceAppInfo,
  Logger,
  type RecordingRequest,
  SingleArgument,
  StepAction,
  TapAction,
  LongPressAction,
  EnterTextAction,
  ScrollAbsAction,
  BackAction,
  HomeAction,
  HideKeyboardAction,
  PressKeyAction,
  LaunchAppAction,
  SetLocationAction,
  GetScreenshotAndHierarchyAction,
  GetAppListAction,
  KillAppAction,
  SwitchToPrimaryAppAction,
  CheckAppInForegroundAction,
  DeeplinkAction,
} from '@finalrun/common';
import { GrpcDriverClient } from '../grpc/GrpcDriverClient.js';
import { DeviceSession } from './DeviceSession.js';
import {
  defaultRecordingManager,
  type DeviceRecordingController,
} from './RecordingManager.js';
import { ScreenshotCaptureHelper } from './ScreenshotCapture.js';

/**
 * Represents a single connected device and implements the Agent interface.
 * Bridges DeviceActionRequest → gRPC calls via GrpcDriverClient.
 *
 * Dart equivalent: Device in device_node/lib/device/Device.dart
 */
export class Device implements Agent {
  private _deviceInfo: DeviceInfo;
  private _grpcClient: GrpcDriverClient;
  private _apiKey: string = '';
  private _disconnectionCallback: ((deviceUUID: string, reason: string) => void) | null = null;
  private _session: DeviceSession;
  private _screenshotCaptureHelper: ScreenshotCaptureHelper;
  private _refreshIOSAppIdsBeforeLaunch: (() => Promise<void>) | null;
  private _getIOSInstalledApps: (() => Promise<DeviceAppInfo[]>) | null;
  private _openDeepLink: ((deeplink: string) => Promise<boolean>) | null;
  private _recordingController: DeviceRecordingController;

  constructor(params: {
    deviceInfo: DeviceInfo;
    grpcClient: GrpcDriverClient;
    refreshIOSAppIdsBeforeLaunch?: () => Promise<void>;
    getIOSInstalledApps?: () => Promise<DeviceAppInfo[]>;
    openDeepLink?: (deeplink: string) => Promise<boolean>;
    recordingController?: DeviceRecordingController;
  }) {
    this._deviceInfo = params.deviceInfo;
    this._grpcClient = params.grpcClient;
    this._session = new DeviceSession();
    this._screenshotCaptureHelper = new ScreenshotCaptureHelper({
      grpcClient: this._grpcClient,
      session: this._session,
    });
    this._refreshIOSAppIdsBeforeLaunch = params.refreshIOSAppIdsBeforeLaunch ?? null;
    this._getIOSInstalledApps = params.getIOSInstalledApps ?? null;
    this._openDeepLink = params.openDeepLink ?? null;
    this._recordingController = params.recordingController ?? defaultRecordingManager;
  }

  // ========== Agent interface implementation ==========

  // Dart: Future<DeviceNodeResponse> setUp({bool reuseAddress = false})
  async setUp(_options?: { reuseAddress?: boolean }): Promise<DeviceNodeResponse> {
    // Device is already set up via GrpcDriverSetup before this is called.
    // We just verify the connection is alive.
    if (!this._grpcClient.isConnected) {
      return new DeviceNodeResponse({
        success: false,
        message: 'gRPC client not connected',
      });
    }
    return new DeviceNodeResponse({ success: true });
  }

  // Dart: Future<DeviceNodeResponse> executeAction(DeviceActionRequest request)
  async executeAction(request: DeviceActionRequest): Promise<DeviceNodeResponse> {
    try {
      this._session.setShouldEnsureStability(request.shouldEnsureStability);
      const action = request.action;
      const actionType = action.type;

      switch (actionType) {
        case StepAction.TAP: {
          const tapAction = action as TapAction;
          const resp = await this._grpcClient.tap({
            x: tapAction.point.x,
            y: tapAction.point.y,
            repeat: tapAction.repeat,
            delay: tapAction.delay,
          });
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
            data: { x: (resp as { x?: number }).x, y: (resp as { y?: number }).y },
          });
        }

        case StepAction.LONG_PRESS: {
          const lpAction = action as LongPressAction;
          // Long press → tap with delay
          const resp = await this._grpcClient.tap({
            x: lpAction.point.x,
            y: lpAction.point.y,
            delay: 1500,
          });
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.ENTER_TEXT: {
          const textAction = action as EnterTextAction;
          const resp = await this._grpcClient.enterText({
            value: textAction.value,
            shouldEraseText: textAction.shouldEraseText,
            eraseCount: textAction.eraseCount ?? undefined,
          });
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.SCROLL_ABS: {
          const scrollAction = action as ScrollAbsAction;
          const resp = await this._grpcClient.swipe({
            startX: scrollAction.startX,
            startY: scrollAction.startY,
            endX: scrollAction.endX,
            endY: scrollAction.endY,
            durationMs: scrollAction.durationMs,
          });
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.BACK: {
          const resp = await this._grpcClient.back();
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.HOME: {
          const resp = await this._grpcClient.home();
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.HIDE_KEYBOARD: {
          const resp = await this._grpcClient.hideKeyboard();
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.PRESS_KEY: {
          const pressAction = action as PressKeyAction;
          const resp = await this._grpcClient.pressKey(pressAction.key);
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.LAUNCH_APP: {
          const launchAction = action as LaunchAppAction;
          if (!this._deviceInfo.isAndroid && this._refreshIOSAppIdsBeforeLaunch) {
            try {
              await this._refreshIOSAppIdsBeforeLaunch();
            } catch (error) {
              Logger.w('Failed to refresh iOS app IDs before launch:', error);
            }
          }
          const resp = await this._grpcClient.launchApp({
            appUpload: { packageName: launchAction.appUpload.packageName },
            allowAllPermissions: launchAction.allowAllPermissions,
            shouldUninstallBeforeLaunch: launchAction.shouldUninstallBeforeLaunch,
            arguments: Object.fromEntries(
              Object.entries(launchAction.arguments).map(([k, v]) => [k, { type: (v as SingleArgument).type, value: (v as SingleArgument).value }]),
            ),
            permissions: launchAction.permissions,
          });
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.KILL_APP: {
          const killAction = action as KillAppAction;
          const resp = await this._grpcClient.killApp(killAction.packageName);
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.DEEPLINK: {
          const deeplinkAction = action as DeeplinkAction;
          Logger.d(`Executing deeplink action: ${deeplinkAction.deeplink}`);
          if (!this._openDeepLink) {
            return new DeviceNodeResponse({
              success: false,
              message: 'Deeplink actions are not supported for this device.',
            });
          }
          const opened = await this._openDeepLink(deeplinkAction.deeplink);
          return new DeviceNodeResponse({
            success: opened,
            message: opened
              ? `Successfully opened deep link: ${deeplinkAction.deeplink}`
              : `Failed to open deep link: ${deeplinkAction.deeplink}`,
          });
        }

        case StepAction.SET_LOCATION: {
          const locAction = action as SetLocationAction;
          const resp = await this._grpcClient.setLocation(
            parseFloat(locAction.lat),
            parseFloat(locAction.long),
          );
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.SWITCH_TO_PRIMARY_APP: {
          const switchAction = action as SwitchToPrimaryAppAction;
          const resp = await this._grpcClient.switchToPrimaryApp(switchAction.packageName);
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.CHECK_APP_IN_FOREGROUND: {
          const checkAction = action as CheckAppInForegroundAction;
          const resp = await this._grpcClient.checkAppInForeground(
            checkAction.packageName,
            checkAction.timeoutSeconds,
          );
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
          });
        }

        case StepAction.GET_SCREENSHOT_AND_HIERARCHY: {
          return this._screenshotCaptureHelper.capture(request.traceStep);
        }

        case StepAction.GET_APP_LIST: {
          if (!this._deviceInfo.isAndroid && this._getIOSInstalledApps) {
            const apps = await this._getIOSInstalledApps();
            return new DeviceNodeResponse({
              success: true,
              data: {
                apps: apps.map((app) => app.toJson()),
              },
            });
          }
          const resp = await this._grpcClient.getAppList();
          return new DeviceNodeResponse({
            success: resp.success,
            message: resp.message,
            data: {
              apps: resp.apps?.map((a) => ({
                packageName: a.packageName,
                name: a.name,
                version: a.version,
              })) ?? [],
            },
          });
        }

        case StepAction.WAIT: {
          // Wait action — just resolve immediately (wait is handled in executor)
          return new DeviceNodeResponse({ success: true });
        }

        default:
          return new DeviceNodeResponse({
            success: false,
            message: `Unsupported action type: ${actionType}`,
          });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.e(`Action execution failed: ${message}`);
      return new DeviceNodeResponse({
        success: false,
        message: `Action failed: ${message}`,
      });
    }
  }

  isConnected(): boolean {
    return this._grpcClient.isConnected;
  }

  getDeviceInfo(): DeviceInfo {
    return this._deviceInfo;
  }

  async closeConnection(): Promise<void> {
    try {
      await this.recordingCleanUp();
    } catch (error) {
      Logger.w('Failed to clean up recording resources:', error);
    }
    this._grpcClient.close();
  }

  killDriver(): void {
    this._grpcClient.close();
  }

  setApiKey(apiKey: string): void {
    this._apiKey = apiKey;
  }

  getId(): string {
    return this._deviceInfo.deviceUUID;
  }

  listenForDeviceDisconnection(callbacks: {
    onDeviceDisconnected: (deviceUUID: string, reason: string) => void;
  }): void {
    this._disconnectionCallback = callbacks.onDeviceDisconnected;
  }

  clearListener(): void {
    this._disconnectionCallback = null;
  }

  async startRecording(recordingRequest: RecordingRequest): Promise<DeviceNodeResponse> {
    if (!this._deviceInfo.id) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Device ID is required to start recording.',
      });
    }

    return await this._recordingController.startRecording({
      deviceId: this._deviceInfo.id,
      recordingRequest,
      platform: this._deviceInfo.getPlatform(),
      sdkVersion:
        this._deviceInfo.sdkVersion > 0 ? String(this._deviceInfo.sdkVersion) : undefined,
    });
  }

  async stopRecording(testRunId: string, testCaseId: string): Promise<DeviceNodeResponse> {
    return await this._recordingController.stopRecording(testRunId, testCaseId, {
      platform: this._deviceInfo.getPlatform(),
      keepOutput: true,
    });
  }

  async recordingCleanUp(): Promise<void> {
    if (!this._deviceInfo.id) {
      return;
    }

    await this._recordingController.cleanupDevice(this._deviceInfo.id, {
      platform: this._deviceInfo.getPlatform(),
      keepOutput: false,
    });
  }

  async abortRecording(testRunId: string, keepOutput: boolean = false): Promise<void> {
    if (!this._deviceInfo.id) {
      return;
    }

    await this._recordingController.abortRecording(testRunId, {
      deviceId: this._deviceInfo.id,
      platform: this._deviceInfo.getPlatform(),
      keepOutput,
    });
  }

  uninstallDriver(): void {
    // Platform-specific uninstall handled externally
    Logger.d(`Uninstall driver for device: ${this._deviceInfo.deviceUUID}`);
  }

  // ========== gRPC convenience methods (used directly by goal-executor) ==========

  /**
   * Get screenshot and hierarchy in one call.
   * Returns raw gRPC response data.
   */
  async getScreenshotAndHierarchy(): Promise<{
    screenshot: string | undefined;
    hierarchy: string | undefined;
    screenWidth: number;
    screenHeight: number;
  }> {
    const resp = await this._grpcClient.getScreenshotAndHierarchy();
    return {
      screenshot: resp.screenshot,
      hierarchy: resp.hierarchy,
      screenWidth: resp.screenWidth,
      screenHeight: resp.screenHeight,
    };
  }

  /** Get list of installed apps. */
  async getInstalledApps(): Promise<DeviceAppInfo[]> {
    if (!this._deviceInfo.isAndroid && this._getIOSInstalledApps) {
      return await this._getIOSInstalledApps();
    }
    const resp = await this._grpcClient.getAppList();
    return (resp.apps ?? []).map(
      (a) =>
        new DeviceAppInfo({
          packageName: a.packageName,
          name: a.name,
          version: a.version ?? null,
        }),
    );
  }
}
