import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import {
  DeviceAppInfo,
  Logger,
  type SingleArgument,
} from '@finalrun/common';

const execFileAsync = promisify(execFile);

type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export const IOS_DRIVER_RUNNER_BUNDLE_ID = 'app.finalrun.iosUITests.xctrunner';

export interface IOSDriverProcessHandle {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface IOSCommandResult {
  success: boolean;
  message?: string;
  stdout?: string;
  stderr?: string;
  data?: Record<string, unknown>;
}

const IOS_PERMISSION_KEYS = [
  'calendar',
  'camera',
  'contacts',
  'homeKit',
  'location',
  'medialibrary',
  'microphone',
  'motion',
  'notifications',
  'photos',
  'reminders',
  'siri',
  'speech',
  'userTracking',
];

export class SimctlClient {
  private _execFileFn: ExecFileFn;
  private _spawnFn: typeof spawn;

  constructor(params?: { execFileFn?: ExecFileFn; spawnFn?: typeof spawn }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
    this._spawnFn = params?.spawnFn ?? spawn;
  }

  async installApp(deviceId: string, appPath: string): Promise<boolean> {
    const result = await this._runCommand(
      'xcrun',
      ['simctl', 'install', deviceId, appPath],
      `Failed to install iOS app on ${deviceId}`,
    );
    if (result.success) {
      Logger.i(`Installed iOS app on ${deviceId}: ${appPath}`);
    }
    return result.success;
  }

  async uninstallApp(deviceId: string, bundleId: string): Promise<IOSCommandResult> {
    return await this._runCommand(
      'xcrun',
      ['simctl', 'uninstall', deviceId, bundleId],
      `Failed to uninstall ${bundleId} on ${deviceId}`,
      { suppressErrorLog: true },
    );
  }

  async openUrl(deviceId: string, deeplink: string): Promise<boolean> {
    const result = await this._runCommand(
      'xcrun',
      ['simctl', 'openurl', deviceId, deeplink],
      `Failed to open iOS deeplink on ${deviceId}`,
    );
    if (result.success) {
      Logger.i(`Opened iOS deeplink on ${deviceId}: ${deeplink}`);
    }
    return result.success;
  }

  async terminateAppResult(deviceId: string, bundleId: string): Promise<IOSCommandResult> {
    const result = await this._runCommand(
      'xcrun',
      ['simctl', 'terminate', deviceId, bundleId],
      `Failed to terminate ${bundleId} on ${deviceId}`,
      { suppressErrorLog: true },
    );
    if (
      !result.success &&
      result.message?.includes('found nothing to terminate')
    ) {
      return {
        success: true,
        message: 'App was not running',
      };
    }

    return result;
  }

  async terminateApp(deviceId: string, bundleId: string): Promise<void> {
    await this.terminateAppResult(deviceId, bundleId);
  }

  async launchApp(
    deviceId: string,
    bundleId: string,
    argumentsMap?: Record<string, SingleArgument>,
  ): Promise<IOSCommandResult> {
    const args = ['simctl', 'launch', deviceId, bundleId];
    const launchArgs: string[] = [];

    for (const [argumentKey, argumentValue] of Object.entries(argumentsMap ?? {})) {
      const key = argumentValue.key || argumentKey;
      if (argumentValue.type.toLowerCase() === 'env') {
        args.push('--env', `${key}=${argumentValue.value}`);
      } else {
        launchArgs.push(argumentValue.value);
      }
    }

    if (launchArgs.length > 0) {
      args.push('--args', ...launchArgs);
    }

    return await this._runCommand(
      'xcrun',
      args,
      `Failed to launch ${bundleId} on ${deviceId}`,
    );
  }

  async bringAppToForeground(
    deviceId: string,
    bundleId: string,
    argumentsMap?: Record<string, SingleArgument>,
  ): Promise<IOSCommandResult> {
    return await this.launchApp(deviceId, bundleId, argumentsMap);
  }

  async setLocation(
    deviceId: string,
    latitude: string,
    longitude: string,
  ): Promise<IOSCommandResult> {
    return await this._runCommand(
      'xcrun',
      ['simctl', 'location', deviceId, 'set', `${latitude},${longitude}`],
      `Failed to set iOS location on ${deviceId}`,
    );
  }

  async clearLocation(deviceId: string): Promise<IOSCommandResult> {
    return await this._runCommand(
      'xcrun',
      ['simctl', 'location', deviceId, 'clear'],
      `Failed to clear iOS location on ${deviceId}`,
    );
  }

  async pressButton(deviceId: string, button: string): Promise<IOSCommandResult> {
    const normalizedButton = this._normalizeButtonName(button);
    const simctlButton =
      normalizedButton === 'power'
        ? 'lock'
        : normalizedButton === 'menu'
          ? 'home'
          : normalizedButton;

    if (!['home', 'lock', 'volumeup', 'volumedown'].includes(simctlButton)) {
      return {
        success: false,
        message: `iOS simctl button is not mapped: ${button}`,
        data: { handled: false },
      };
    }

    const result = await this._runCommand(
      'xcrun',
      ['simctl', 'io', deviceId, 'ui', simctlButton],
      `Failed to press iOS button ${button} on ${deviceId}`,
    );
    return {
      ...result,
      data: { handled: true },
    };
  }

  async allowAllPermissions(
    deviceId: string,
    bundleId: string,
  ): Promise<IOSCommandResult> {
    const permissions = Object.fromEntries(
      IOS_PERMISSION_KEYS.map((permission) => [permission, 'allow']),
    );
    return await this.togglePermissions(deviceId, bundleId, permissions);
  }

  async togglePermissions(
    deviceId: string,
    bundleId: string,
    permissions: Record<string, string>,
  ): Promise<IOSCommandResult> {
    const nonSimctlPermissions: string[] = [];

    if ('location' in permissions) {
      const locationAction = permissions['location'];
      const locationCommand = ['simctl', 'privacy', deviceId];
      switch (locationAction) {
        case 'allow':
          locationCommand.push('grant', 'location-always', bundleId);
          break;
        case 'deny':
          locationCommand.push('revoke', 'location-always', bundleId);
          break;
        case 'unset':
          locationCommand.push('reset', 'location-always', bundleId);
          break;
        default:
          return {
            success: false,
            message: `Invalid action for location permission: ${locationAction}`,
          };
      }

      const locationResult = await this._runCommand(
        'xcrun',
        locationCommand,
        `Failed to update iOS location permission for ${bundleId} on ${deviceId}`,
      );
      if (!locationResult.success) {
        return locationResult;
      }
    }

    for (const [permissionName, action] of Object.entries(permissions)) {
      if (permissionName === 'location') {
        continue;
      }

      let translatedValue: string;
      switch (action) {
        case 'allow':
          translatedValue = 'YES';
          break;
        case 'deny':
          translatedValue = 'NO';
          break;
        case 'unset':
          translatedValue = 'unset';
          break;
        default:
          return {
            success: false,
            message: `Invalid action for ${permissionName}: ${action}`,
          };
      }

      nonSimctlPermissions.push(`${permissionName}=${translatedValue}`);
    }

    if (nonSimctlPermissions.length === 0) {
      return { success: true };
    }

    if (!(await this.isApplesimutilsInstalled())) {
      return {
        success: false,
        message:
          'applesimutils is not installed. Please install it to manage permissions.',
      };
    }

    return await this._runCommand(
      'applesimutils',
      [
        '--byId',
        deviceId,
        '--bundle',
        bundleId,
        '--setPermissions',
        nonSimctlPermissions.join(','),
      ],
      `Failed to update iOS permissions for ${bundleId} on ${deviceId}`,
    );
  }

  async isApplesimutilsInstalled(): Promise<boolean> {
    const result = await this._runCommand(
      'which',
      ['applesimutils'],
      'Failed to resolve applesimutils',
      { suppressErrorLog: true },
    );
    return result.success && Boolean(result.stdout);
  }

  async clearClipboard(deviceId: string): Promise<IOSCommandResult> {
    return await this._runCommand(
      '/bin/bash',
      ['-c', `echo -n "" | xcrun simctl pbcopy ${deviceId}`],
      `Failed to clear simulator clipboard on ${deviceId}`,
    );
  }

  async clearSafariData(deviceId: string): Promise<IOSCommandResult> {
    const result = await this._runCommand(
      'xcrun',
      ['simctl', 'spawn', deviceId, 'rm', '-rf', 'Library/Safari'],
      `Failed to clear Safari data on ${deviceId}`,
      { suppressErrorLog: true },
    );
    if (
      !result.success &&
      result.message?.includes('No such file or directory')
    ) {
      return {
        success: true,
        message: 'Safari data already clean',
      };
    }
    return result;
  }

  async resetAllPermissions(deviceId: string): Promise<IOSCommandResult> {
    return await this._runCommand(
      'xcrun',
      ['simctl', 'privacy', deviceId, 'reset', 'all'],
      `Failed to reset simulator permissions on ${deviceId}`,
    );
  }

  async uninstallUserApps(deviceId: string): Promise<IOSCommandResult> {
    const metadata = await this._listInstalledAppMetadata(deviceId);
    if (!metadata.success || !metadata.data?.['apps']) {
      return {
        success: false,
        message: metadata.message ?? 'Failed to load installed simulator apps',
      };
    }

    const apps = metadata.data['apps'] as Array<Record<string, unknown>>;
    const bundleIds = apps
      .filter((app) => app['bundleId'] !== IOS_DRIVER_RUNNER_BUNDLE_ID)
      .filter((app) => app['applicationType'] === 'User')
      .map((app) => app['bundleId'] as string);

    for (const bundleId of bundleIds) {
      const uninstallResult = await this.uninstallApp(deviceId, bundleId);
      if (!uninstallResult.success) {
        return uninstallResult;
      }
    }

    return {
      success: true,
      message: `Uninstalled ${bundleIds.length} user apps`,
    };
  }

  async listInstalledApps(deviceId: string): Promise<DeviceAppInfo[]> {
    const metadata = await this._listInstalledAppMetadata(deviceId);
    if (!metadata.success || !metadata.data?.['apps']) {
      return [];
    }

    return (metadata.data['apps'] as Array<Record<string, unknown>>)
      .map(
        (app) =>
          new DeviceAppInfo({
            packageName: app['bundleId'] as string,
            name: app['name'] as string,
            version: (app['version'] as string | null | undefined) ?? null,
          }),
      )
      .sort((left, right) => left.packageName.localeCompare(right.packageName));
  }

  async listInstalledAppIds(deviceId: string): Promise<string[]> {
    const apps = await this.listInstalledApps(deviceId);
    return DeviceAppInfo.getAppIdList(apps);
  }

  startDriver(deviceId: string, port: number): IOSDriverProcessHandle {
    const child = this._spawnFn(
      'xcrun',
      [
        'simctl',
        'launch',
        '--console',
        '--terminate-running-process',
        deviceId,
        IOS_DRIVER_RUNNER_BUNDLE_ID,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          SIMCTL_CHILD_port: String(port),
          SIMCTL_CHILD_app_perfect_device_id: deviceId,
        },
      },
    ) as ChildProcess;

    Logger.d(
      `Starting iOS driver: xcrun simctl launch --console --terminate-running-process ${deviceId} ${IOS_DRIVER_RUNNER_BUNDLE_ID}`,
    );
    return child as IOSDriverProcessHandle;
  }

  private async _listInstalledAppMetadata(deviceId: string): Promise<IOSCommandResult> {
    const result = await this._runCommand(
      '/bin/bash',
      ['-c', `xcrun simctl listapps ${deviceId} | plutil -convert json - -o -`],
      `Failed to list iOS apps on ${deviceId}`,
    );
    if (!result.success) {
      return result;
    }

    try {
      const parsed = JSON.parse(result.stdout ?? '') as Record<string, unknown>;
      const apps: Array<Record<string, unknown>> = [];

      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          continue;
        }

        const valueRecord = value as Record<string, unknown>;
        const bundleId =
          (valueRecord['CFBundleIdentifier'] as string | undefined)?.trim() ||
          (valueRecord['bundleIdentifier'] as string | undefined)?.trim() ||
          (valueRecord['bundleId'] as string | undefined)?.trim() ||
          key.trim();
        if (!bundleId) {
          continue;
        }

        const fallbackName = key.trim() || bundleId;
        const name =
          (valueRecord['CFBundleDisplayName'] as string | undefined)?.trim() ||
          (valueRecord['CFBundleName'] as string | undefined)?.trim() ||
          fallbackName;
        const version =
          (valueRecord['CFBundleVersion'] as string | undefined)?.trim() ?? null;
        const applicationType =
          (valueRecord['ApplicationType'] as string | undefined)?.trim() ??
          (bundleId.startsWith('com.apple.') ? 'System' : 'User');

        apps.push({
          bundleId,
          name,
          version,
          applicationType,
        });
      }

      return {
        success: true,
        data: { apps },
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : `Failed to parse iOS app metadata: ${String(error)}`,
      };
    }
  }

  private async _runCommand(
    file: string,
    args: readonly string[],
    failurePrefix: string,
    options?: { suppressErrorLog?: boolean },
  ): Promise<IOSCommandResult> {
    try {
      const { stdout, stderr } = await this._execFileFn(file, args);
      const stdoutText = stdout.toString().trim();
      const stderrText = stderr.toString().trim();
      return {
        success: true,
        message: stderrText || stdoutText || undefined,
        stdout: stdoutText,
        stderr: stderrText,
      };
    } catch (error) {
      const result = this._toFailureResult(failurePrefix, error);
      if (!options?.suppressErrorLog) {
        Logger.e(failurePrefix, error);
      }
      return result;
    }
  }

  private _toFailureResult(
    failurePrefix: string,
    error: unknown,
  ): IOSCommandResult {
    const stdout =
      typeof error === 'object' &&
      error !== null &&
      'stdout' in error &&
      (typeof (error as { stdout?: unknown }).stdout === 'string' ||
        Buffer.isBuffer((error as { stdout?: unknown }).stdout))
        ? (error as { stdout?: string | Buffer }).stdout?.toString().trim()
        : '';
    const stderr =
      typeof error === 'object' &&
      error !== null &&
      'stderr' in error &&
      (typeof (error as { stderr?: unknown }).stderr === 'string' ||
        Buffer.isBuffer((error as { stderr?: unknown }).stderr))
        ? (error as { stderr?: string | Buffer }).stderr?.toString().trim()
        : '';
    const errorMessage = stderr || stdout || (error instanceof Error ? error.message : String(error));

    return {
      success: false,
      message: `${failurePrefix}: ${errorMessage}`,
      stdout,
      stderr,
    };
  }

  private _normalizeButtonName(button: string): string {
    return button.trim().toLowerCase().replace(/[\s-]+/g, '');
  }
}
