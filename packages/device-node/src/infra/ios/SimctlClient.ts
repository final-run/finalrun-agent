import { spawn, execFile, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { DeviceAppInfo, Logger } from '@finalrun/common';

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

export class SimctlClient {
  private _execFileFn: ExecFileFn;
  private _spawnFn: typeof spawn;

  constructor(params?: { execFileFn?: ExecFileFn; spawnFn?: typeof spawn }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
    this._spawnFn = params?.spawnFn ?? spawn;
  }

  async installApp(deviceId: string, appPath: string): Promise<boolean> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'install', deviceId, appPath]);
      Logger.i(`Installed iOS app on ${deviceId}: ${appPath}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to install iOS app on ${deviceId}:`, error);
      return false;
    }
  }

  async openUrl(deviceId: string, deeplink: string): Promise<boolean> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'openurl', deviceId, deeplink]);
      Logger.i(`Opened iOS deeplink on ${deviceId}: ${deeplink}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to open iOS deeplink on ${deviceId}:`, error);
      return false;
    }
  }

  async terminateApp(deviceId: string, bundleId: string): Promise<void> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'terminate', deviceId, bundleId]);
    } catch (error) {
      Logger.d(`Ignoring iOS terminate failure for ${bundleId} on ${deviceId}:`, error);
    }
  }

  async listInstalledApps(deviceId: string): Promise<DeviceAppInfo[]> {
    try {
      const { stdout } = await this._execFileFn('/bin/bash', [
        '-c',
        `xcrun simctl listapps ${deviceId} | plutil -convert json - -o -`,
      ]);
      const parsed = JSON.parse(stdout.toString()) as Record<string, unknown>;
      const apps: DeviceAppInfo[] = [];

      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          continue;
        }

        const valueRecord = value as Record<string, unknown>;
        const bundleId =
          (valueRecord['CFBundleIdentifier'] as string | undefined) ??
          (valueRecord['bundleIdentifier'] as string | undefined) ??
          (valueRecord['bundleId'] as string | undefined) ??
          key;
        if (!bundleId?.trim()) {
          continue;
        }

        const packageName = bundleId.trim();
        const fallbackName = key.trim() || packageName;
        const name =
          (valueRecord['CFBundleDisplayName'] as string | undefined)?.trim() ??
          (valueRecord['CFBundleName'] as string | undefined)?.trim() ??
          fallbackName;
        const version =
          (valueRecord['CFBundleVersion'] as string | undefined)?.trim() ??
          null;

        apps.push(
          new DeviceAppInfo({
            packageName,
            name,
            version,
          }),
        );
      }

      return apps.sort((left, right) =>
        left.packageName.localeCompare(right.packageName),
      );
    } catch (error) {
      Logger.e(`Failed to list iOS apps on ${deviceId}:`, error);
      return [];
    }
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
}
