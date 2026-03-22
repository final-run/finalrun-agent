import type {
  BackAction,
  CheckAppInForegroundAction,
  DeeplinkAction,
  DeviceAppInfo,
  DeviceNodeResponse,
  EnterTextAction,
  HideKeyboardAction,
  HomeAction,
  KillAppAction,
  LaunchAppAction,
  LongPressAction,
  PressKeyAction,
  ScrollAbsAction,
  SetLocationAction,
  SwitchToPrimaryAppAction,
  TapAction,
} from '@finalrun/common';

export interface DeviceScreenshotAndHierarchy {
  screenshot: string | undefined;
  hierarchy: string | undefined;
  screenWidth: number;
  screenHeight: number;
}

export interface DeviceRuntime {
  setShouldEnsureStability(shouldEnsureStability: boolean | undefined): void;
  isConnected(): boolean;
  tap(action: TapAction): Promise<DeviceNodeResponse>;
  longPress(action: LongPressAction): Promise<DeviceNodeResponse>;
  enterText(action: EnterTextAction): Promise<DeviceNodeResponse>;
  scrollAbs(action: ScrollAbsAction): Promise<DeviceNodeResponse>;
  back(action: BackAction): Promise<DeviceNodeResponse>;
  home(action: HomeAction): Promise<DeviceNodeResponse>;
  hideKeyboard(action: HideKeyboardAction): Promise<DeviceNodeResponse>;
  pressKey(action: PressKeyAction): Promise<DeviceNodeResponse>;
  launchApp(action: LaunchAppAction): Promise<DeviceNodeResponse>;
  killApp(action: KillAppAction): Promise<DeviceNodeResponse>;
  openDeepLink(action: DeeplinkAction): Promise<DeviceNodeResponse>;
  setLocation(action: SetLocationAction): Promise<DeviceNodeResponse>;
  switchToPrimaryApp(action: SwitchToPrimaryAppAction): Promise<DeviceNodeResponse>;
  checkAppInForeground(action: CheckAppInForegroundAction): Promise<DeviceNodeResponse>;
  captureState(traceStep?: number | null): Promise<DeviceNodeResponse>;
  getInstalledAppsResponse(): Promise<DeviceNodeResponse>;
  getInstalledApps(): Promise<DeviceAppInfo[]>;
  getScreenshotAndHierarchy(): Promise<DeviceScreenshotAndHierarchy>;
  close(): Promise<void>;
  killDriver(): void;
}
