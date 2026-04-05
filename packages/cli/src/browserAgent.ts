import {
  AppUpload,
  BackAction,
  CheckAppInForegroundAction,
  DeeplinkAction,
  DeviceAction,
  DeviceActionRequest,
  DeviceAgent,
  DeviceInfo,
  DeviceNodeResponse,
  EnterTextAction,
  EraseTextAction,
  GetAppListAction,
  GetHierarchyAction,
  GetScreenshotAction,
  GetScreenshotAndHierarchyAction,
  HideKeyboardAction,
  HomeAction,
  KillAppAction,
  LaunchAppAction,
  LongPressAction,
  PLATFORM_WEB,
  PointPercent,
  PressKeyAction,
  RotateAction,
  ScrollAbsAction,
  SetLocationAction,
  SwitchToPrimaryAppAction,
  TapAction,
  TapPercentAction,
  type RecordingRequest,
} from '@finalrun/common';
import type { ResolvedAppConfig } from './appConfig.js';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type Page,
} from 'playwright';

export async function createBrowserAgent(params: {
  target: ResolvedAppConfig;
}): Promise<BrowserAgent> {
  if (params.target.platform !== PLATFORM_WEB) {
    throw new Error('BrowserAgent requires a resolved web target.');
  }

  const browserName = params.target.browser ?? 'chromium';
  const browserType = resolveBrowserType(browserName);
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: params.target.viewport ?? { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const agent = new BrowserAgent({
    browser,
    context,
    page,
    target: params.target,
  });
  await agent.navigate(params.target.identifier);
  return agent;
}

class BrowserAgent implements DeviceAgent {
  private readonly _browser: Browser;
  private readonly _context: BrowserContext;
  private readonly _page: Page;
  private readonly _target: ResolvedAppConfig;
  private readonly _deviceInfo: DeviceInfo;

  constructor(params: {
    browser: Browser;
    context: BrowserContext;
    page: Page;
    target: ResolvedAppConfig;
  }) {
    this._browser = params.browser;
    this._context = params.context;
    this._page = params.page;
    this._target = params.target;
    this._deviceInfo = new DeviceInfo({
      id: null,
      deviceUUID: `web:${params.target.browser ?? 'chromium'}`,
      isAndroid: false,
      sdkVersion: 0,
      name: params.target.browser ?? 'chromium',
      platform: PLATFORM_WEB,
    });
  }

  async setUp(): Promise<DeviceNodeResponse> {
    return new DeviceNodeResponse({ success: true, message: 'Browser session is ready.' });
  }

  async executeAction(request: DeviceActionRequest): Promise<DeviceNodeResponse> {
    try {
      return await withTimeout(
        this._executeActionInternal(request),
        request.timeout * 1000,
        `Browser action timed out after ${request.timeout}s`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new DeviceNodeResponse({ success: false, message });
    }
  }

  isConnected(): boolean {
    return !this._page.isClosed();
  }

  getDeviceInfo(): DeviceInfo {
    return this._deviceInfo;
  }

  async closeConnection(): Promise<void> {
    await this._context.close().catch(() => undefined);
    await this._browser.close().catch(() => undefined);
  }

  killDriver(): void {
    void this.closeConnection();
  }

  setApiKey(_apiKey: string): void {}

  getId(): string {
    return this._deviceInfo.deviceUUID;
  }

  listenForDeviceDisconnection(_callbacks: {
    onDeviceDisconnected: (deviceUUID: string, reason: string) => void;
  }): void {}

  clearListener(): void {}

  async startRecording(_recordingRequest: RecordingRequest): Promise<DeviceNodeResponse> {
    return new DeviceNodeResponse({
      success: false,
      message: 'Browser recording is not supported yet.',
    });
  }

  async stopRecording(_runId: string, _testId: string): Promise<DeviceNodeResponse> {
    return new DeviceNodeResponse({
      success: false,
      message: 'Browser recording is not supported yet.',
    });
  }

  async recordingCleanUp(): Promise<void> {}

  async abortRecording(_runId: string, _keepOutput?: boolean): Promise<void> {}

  uninstallDriver(): void {}

  async navigate(url: string): Promise<void> {
    await this._page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  private async _executeActionInternal(
    request: DeviceActionRequest,
  ): Promise<DeviceNodeResponse> {
    switch (request.action.type) {
      case DeviceAction.TAP:
        return await this._tap(request.action as TapAction);
      case DeviceAction.TAP_PERCENT:
        return await this._tapPercent(request.action as TapPercentAction);
      case DeviceAction.LONG_PRESS:
        return await this._longPress(request.action as LongPressAction);
      case DeviceAction.ENTER_TEXT:
        return await this._enterText(request.action as EnterTextAction);
      case DeviceAction.ERASE_TEXT:
        return await this._eraseText(request.action as EraseTextAction);
      case DeviceAction.SCROLL_ABS:
        return await this._scroll(request.action as ScrollAbsAction);
      case DeviceAction.BACK:
        return await this._goBack(request.action as BackAction);
      case DeviceAction.HOME:
        return await this._goHome(request.action as HomeAction);
      case DeviceAction.HIDE_KEYBOARD:
        return this._success('No on-screen keyboard to hide in browser mode.');
      case DeviceAction.PRESS_KEY:
        return await this._pressKey(request.action as PressKeyAction);
      case DeviceAction.LAUNCH_APP:
        return await this._launchTarget(request.action as LaunchAppAction);
      case DeviceAction.KILL_APP:
        return await this._killTarget(request.action as KillAppAction);
      case DeviceAction.DEEPLINK:
        return await this._openDeepLink(request.action as DeeplinkAction);
      case DeviceAction.SET_LOCATION:
        return await this._setLocation(request.action as SetLocationAction);
      case DeviceAction.GET_SCREENSHOT_AND_HIERARCHY:
        return await this._captureState();
      case DeviceAction.GET_SCREENSHOT:
        return await this._getScreenshot(request.action as GetScreenshotAction);
      case DeviceAction.GET_HIERARCHY:
        return await this._getHierarchy(request.action as GetHierarchyAction);
      case DeviceAction.GET_APP_LIST:
        return this._getAppList(request.action as GetAppListAction);
      case DeviceAction.SWITCH_TO_PRIMARY_APP:
        return await this._switchToPrimaryTarget(request.action as SwitchToPrimaryAppAction);
      case DeviceAction.CHECK_APP_IN_FOREGROUND:
        return await this._checkTargetInForeground(
          request.action as CheckAppInForegroundAction,
        );
      case DeviceAction.ROTATE:
        return new DeviceNodeResponse({
          success: false,
          message: 'Rotate is not supported for browser sessions yet.',
        });
      case DeviceAction.WAIT:
        return this._success();
      default:
        return new DeviceNodeResponse({
          success: false,
          message: `Unsupported browser action type: ${request.action.type}`,
        });
    }
  }

  private async _tap(action: TapAction): Promise<DeviceNodeResponse> {
    await this._page.mouse.click(action.point.x, action.point.y);
    return this._success();
  }

  private async _tapPercent(action: TapPercentAction): Promise<DeviceNodeResponse> {
    const viewport = this._page.viewportSize() ?? { width: 1440, height: 900 };
    await this._page.mouse.click(
      Math.round((action.point.xPercent / 100) * viewport.width),
      Math.round((action.point.yPercent / 100) * viewport.height),
    );
    return this._success();
  }

  private async _longPress(action: LongPressAction): Promise<DeviceNodeResponse> {
    await this._page.mouse.move(action.point.x, action.point.y);
    await this._page.mouse.down();
    await this._page.waitForTimeout(800);
    await this._page.mouse.up();
    return this._success();
  }

  private async _enterText(action: EnterTextAction): Promise<DeviceNodeResponse> {
    if (action.shouldEraseText) {
      await this._selectAllAndDelete();
    }
    await this._page.keyboard.type(action.value);
    return this._success();
  }

  private async _eraseText(_action: EraseTextAction): Promise<DeviceNodeResponse> {
    await this._selectAllAndDelete();
    return this._success();
  }

  private async _scroll(action: ScrollAbsAction): Promise<DeviceNodeResponse> {
    await this._page.mouse.move(action.startX, action.startY);
    await this._page.mouse.wheel(0, action.startY - action.endY);
    return this._success();
  }

  private async _goBack(_action: BackAction): Promise<DeviceNodeResponse> {
    await this._page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    return this._success();
  }

  private async _goHome(_action: HomeAction): Promise<DeviceNodeResponse> {
    await this.navigate(this._target.identifier);
    return this._success(`Navigated to ${this._target.identifier}`);
  }

  private async _pressKey(action: PressKeyAction): Promise<DeviceNodeResponse> {
    await this._page.keyboard.press(normalizeKey(action.key));
    return this._success();
  }

  private async _launchTarget(action: LaunchAppAction): Promise<DeviceNodeResponse> {
    await this.navigate(action.appUpload.packageName);
    return this._success(`Opened ${action.appUpload.packageName}`);
  }

  private async _killTarget(_action: KillAppAction): Promise<DeviceNodeResponse> {
    await this._page.goto('about:blank');
    return this._success('Closed current page.');
  }

  private async _openDeepLink(action: DeeplinkAction): Promise<DeviceNodeResponse> {
    await this.navigate(action.deeplink);
    return this._success(`Opened ${action.deeplink}`);
  }

  private async _setLocation(action: SetLocationAction): Promise<DeviceNodeResponse> {
    await this._context.grantPermissions(['geolocation']);
    await this._context.setGeolocation({
      latitude: Number(action.lat),
      longitude: Number(action.long),
    });
    return this._success(`Geolocation set to ${action.lat}, ${action.long}`);
  }

  private async _captureState(): Promise<DeviceNodeResponse> {
    await this._page.waitForLoadState('domcontentloaded').catch(() => undefined);
    const screenshotBuffer = await this._page.screenshot({ type: 'png', animations: 'disabled' });
    const hierarchy = await this._page.evaluate(() => {
      const global = globalThis as unknown as {
        document: {
          body: any;
          activeElement: any;
          querySelectorAll: (selector: string) => Iterable<any>;
        };
        getComputedStyle: (node: any) => {
          display: string;
          visibility: string;
          opacity: string;
        };
        window: {
          innerWidth: number;
          innerHeight: number;
          location: { href: string };
        };
      };
      const doc = global.document;
      const win = global.window;
      const rawElements = [
        doc.body,
        ...Array.from(doc.querySelectorAll('*')),
      ].filter(Boolean);
      return rawElements.flatMap((node, index) => {
        const rect = typeof node.getBoundingClientRect === 'function'
          ? node.getBoundingClientRect()
          : null;
        const style = typeof global.getComputedStyle === 'function'
          ? global.getComputedStyle(node)
          : null;
        const hidden =
          !rect ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          style?.display === 'none' ||
          style?.visibility === 'hidden' ||
          style?.opacity === '0';
        if (hidden) {
          return [];
        }

        const text = normalizeText(
          node.innerText ||
          node.textContent ||
          node.value ||
          null,
        );
        const accessibilityText = normalizeText(
          node.getAttribute?.('aria-label') ||
          node.getAttribute?.('title') ||
          node.getAttribute?.('alt') ||
          null,
        );
        const placeholder = normalizeText(node.getAttribute?.('placeholder') || null);
        const role = normalizeText(node.getAttribute?.('role') || null);
        const tagName = normalizeText(node.tagName?.toLowerCase() || null);
        return [{
          index,
          text,
          contentDesc: accessibilityText,
          id: normalizeText(node.id || node.getAttribute?.('name') || null),
          class: [tagName, role ? `[role=${role}]` : null].filter(Boolean).join(''),
          bounds: [
            Math.round(rect.left),
            Math.round(rect.top),
            Math.round(rect.right),
            Math.round(rect.bottom),
          ],
          isScrollable:
            (node.scrollHeight ?? 0) > (node.clientHeight ?? 0) + 4 ||
            (node.scrollWidth ?? 0) > (node.clientWidth ?? 0) + 4,
          isFocused: doc.activeElement === node,
          isEditable: Boolean(
            node.isContentEditable ||
            tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select'
          ),
          isImage: tagName === 'img' || role === 'img',
          hintText: placeholder,
          isSelected: Boolean(
            node.checked ||
            node.selected ||
            node.getAttribute?.('aria-selected') === 'true'
          ),
        }];
      });

      function normalizeText(value: unknown): string | null {
        if (typeof value !== 'string') {
          return null;
        }
        const normalized = value.replace(/\s+/g, ' ').trim();
        return normalized.length > 0 ? normalized : null;
      }
    });
    const viewport = this._page.viewportSize() ?? { width: 1440, height: 900 };
    return new DeviceNodeResponse({
      success: true,
      data: {
        screenshot: screenshotBuffer.toString('base64'),
        hierarchy: JSON.stringify(hierarchy),
        screenWidth: viewport.width,
        screenHeight: viewport.height,
      },
    });
  }

  private async _getScreenshot(_action: GetScreenshotAction): Promise<DeviceNodeResponse> {
    const screenshotBuffer = await this._page.screenshot({ type: 'png', animations: 'disabled' });
    return new DeviceNodeResponse({
      success: true,
      data: { screenshot: screenshotBuffer.toString('base64') },
    });
  }

  private async _getHierarchy(_action: GetHierarchyAction): Promise<DeviceNodeResponse> {
    const state = await this._captureState();
    return new DeviceNodeResponse({
      success: state.success,
      message: state.message ?? undefined,
      data: state.data ? { hierarchy: state.data['hierarchy'] as string } : undefined,
    });
  }

  private _getAppList(_action: GetAppListAction): DeviceNodeResponse {
    const label = this._target.name ?? hostFromUrl(this._target.identifier);
    return new DeviceNodeResponse({
      success: true,
      data: {
        apps: [{
          packageName: this._target.identifier,
          name: label,
        }],
      },
    });
  }

  private async _switchToPrimaryTarget(
    action: SwitchToPrimaryAppAction,
  ): Promise<DeviceNodeResponse> {
    await this.navigate(action.packageName);
    return this._success(`Switched to ${action.packageName}`);
  }

  private async _checkTargetInForeground(
    action: CheckAppInForegroundAction,
  ): Promise<DeviceNodeResponse> {
    const currentUrl = this._page.url();
    const success = currentUrl.startsWith(action.packageName);
    return new DeviceNodeResponse({
      success,
      message: success
        ? `Current page matches ${action.packageName}`
        : `Current page ${currentUrl} does not match ${action.packageName}`,
    });
  }

  private async _selectAllAndDelete(): Promise<void> {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this._page.keyboard.press(`${modifier}+KeyA`);
    await this._page.keyboard.press('Backspace');
  }

  private _success(message?: string): DeviceNodeResponse {
    return new DeviceNodeResponse({ success: true, message });
  }
}

function resolveBrowserType(
  browserName: 'chromium' | 'firefox' | 'webkit',
): BrowserType {
  switch (browserName) {
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
    default:
      return chromium;
  }
}

function normalizeKey(key: string): string {
  const normalized = key.trim().toLowerCase();
  switch (normalized) {
    case 'enter':
    case 'return':
      return 'Enter';
    case 'tab':
      return 'Tab';
    case 'escape':
      return 'Escape';
    case 'backspace':
      return 'Backspace';
    default:
      return key;
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
