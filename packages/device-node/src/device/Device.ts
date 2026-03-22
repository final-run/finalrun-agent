// Port of device_node/lib/device/Device.dart
// Implements the Agent interface with a stable wrapper over a platform runtime.

import {
  Agent,
  DeviceActionRequest,
  DeviceInfo,
  DeviceNodeResponse,
  DeviceAppInfo,
  Logger,
  type RecordingRequest,
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
  KillAppAction,
  SwitchToPrimaryAppAction,
  CheckAppInForegroundAction,
  DeeplinkAction,
} from '@finalrun/common';
import {
  defaultRecordingManager,
  type DeviceRecordingController,
} from './RecordingManager.js';
import type {
  DeviceRuntime,
  DeviceScreenshotAndHierarchy,
} from './shared/DeviceRuntime.js';

/**
 * Represents a single connected device and implements the Agent interface.
 * Bridges DeviceActionRequest -> runtime capability methods.
 *
 * Dart equivalent: Device in device_node/lib/device/Device.dart
 */
export class Device implements Agent {
  private _deviceInfo: DeviceInfo;
  private _runtime: DeviceRuntime;
  private _apiKey: string = '';
  private _disconnectionCallback: ((deviceUUID: string, reason: string) => void) | null = null;
  private _recordingController: DeviceRecordingController;

  constructor(params: {
    deviceInfo: DeviceInfo;
    runtime: DeviceRuntime;
    recordingController?: DeviceRecordingController;
  }) {
    this._deviceInfo = params.deviceInfo;
    this._runtime = params.runtime;
    this._recordingController = params.recordingController ?? defaultRecordingManager;
  }

  async setUp(_options?: { reuseAddress?: boolean }): Promise<DeviceNodeResponse> {
    if (!this._runtime.isConnected()) {
      return new DeviceNodeResponse({
        success: false,
        message: 'gRPC client not connected',
      });
    }
    return new DeviceNodeResponse({ success: true });
  }

  async executeAction(request: DeviceActionRequest): Promise<DeviceNodeResponse> {
    try {
      this._runtime.setShouldEnsureStability(request.shouldEnsureStability);
      const action = request.action;

      switch (action.type) {
        case StepAction.TAP:
          return await this._runtime.tap(action as TapAction);

        case StepAction.LONG_PRESS:
          return await this._runtime.longPress(action as LongPressAction);

        case StepAction.ENTER_TEXT:
          return await this._runtime.enterText(action as EnterTextAction);

        case StepAction.SCROLL_ABS:
          return await this._runtime.scrollAbs(action as ScrollAbsAction);

        case StepAction.BACK:
          return await this._runtime.back(action as BackAction);

        case StepAction.HOME:
          return await this._runtime.home(action as HomeAction);

        case StepAction.HIDE_KEYBOARD:
          return await this._runtime.hideKeyboard(action as HideKeyboardAction);

        case StepAction.PRESS_KEY:
          return await this._runtime.pressKey(action as PressKeyAction);

        case StepAction.LAUNCH_APP:
          return await this._runtime.launchApp(action as LaunchAppAction);

        case StepAction.KILL_APP:
          return await this._runtime.killApp(action as KillAppAction);

        case StepAction.DEEPLINK: {
          const deeplinkAction = action as DeeplinkAction;
          Logger.d(`Executing deeplink action: ${deeplinkAction.deeplink}`);
          return await this._runtime.openDeepLink(deeplinkAction);
        }

        case StepAction.SET_LOCATION:
          return await this._runtime.setLocation(action as SetLocationAction);

        case StepAction.SWITCH_TO_PRIMARY_APP:
          return await this._runtime.switchToPrimaryApp(
            action as SwitchToPrimaryAppAction,
          );

        case StepAction.CHECK_APP_IN_FOREGROUND:
          return await this._runtime.checkAppInForeground(
            action as CheckAppInForegroundAction,
          );

        case StepAction.GET_SCREENSHOT_AND_HIERARCHY:
          return await this._runtime.captureState(request.traceStep);

        case StepAction.GET_APP_LIST:
          return await this._runtime.getInstalledAppsResponse();

        case StepAction.WAIT:
          return new DeviceNodeResponse({ success: true });

        default:
          return new DeviceNodeResponse({
            success: false,
            message: `Unsupported action type: ${action.type}`,
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
    return this._runtime.isConnected();
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
    await this._runtime.close();
  }

  killDriver(): void {
    this._runtime.killDriver();
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
    Logger.d(`Uninstall driver for device: ${this._deviceInfo.deviceUUID}`);
  }

  async getScreenshotAndHierarchy(): Promise<{
    screenshot: string | undefined;
    hierarchy: string | undefined;
    screenWidth: number;
    screenHeight: number;
  }> {
    const response: DeviceScreenshotAndHierarchy =
      await this._runtime.getScreenshotAndHierarchy();
    return response;
  }

  async getInstalledApps(): Promise<DeviceAppInfo[]> {
    return await this._runtime.getInstalledApps();
  }
}
