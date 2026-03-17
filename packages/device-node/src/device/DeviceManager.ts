// Port of device_node/lib/device/DeviceManager.dart
// Manages device discovery and lifecycle using subprocess calls (ADB/IDB).

import { execFile, spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import {
  DeviceAppInfo,
  DeviceInfo,
  Logger,
  DEFAULT_GRPC_PORT_START,
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

/**
 * Manages connected devices — detection, port assignment, and cleanup.
 *
 * Dart equivalent: DeviceManager in device_node/lib/device/DeviceManager.dart
 */
export class DeviceManager {
  private _nextPort: number = DEFAULT_GRPC_PORT_START;
  private _portMap: Map<string, number> = new Map();
  private _execFileFn: ExecFileFn;
  private _spawnFn: typeof spawn;

  constructor(params?: { execFileFn?: ExecFileFn; spawnFn?: typeof spawn }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
    this._spawnFn = params?.spawnFn ?? spawn;
  }

  /**
   * Detect connected Android devices via `adb devices`.
   * Dart: Future<List<DeviceInfo>> getAndroidDevices()
   */
  async getAndroidDevices(adbPath: string): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await this._execFileFn(adbPath, ['devices', '-l']);
      const lines = stdout.toString().split('\n').filter((l) => l.includes('device '));
      const devices: DeviceInfo[] = [];

      for (const line of lines) {
        const serial = line.split(/\s+/)[0];
        if (!serial || serial === 'List') continue;

        // Get SDK version
        let sdkVersion = 0;
        try {
          const { stdout: sdkOut } = await this._execFileFn(adbPath, [
            '-s', serial, 'shell', 'getprop', 'ro.build.version.sdk',
          ]);
          sdkVersion = parseInt(sdkOut.toString().trim(), 10) || 0;
        } catch {
          // ignore
        }

        // Get device name
        let name: string | null = null;
        try {
          const { stdout: nameOut } = await this._execFileFn(adbPath, [
            '-s', serial, 'shell', 'getprop', 'ro.product.model',
          ]);
          name = nameOut.toString().trim() || null;
        } catch {
          // ignore
        }

        devices.push(
          new DeviceInfo({
            id: serial,
            deviceUUID: serial,
            isAndroid: true,
            sdkVersion,
            name,
          }),
        );
      }

      return devices;
    } catch (error) {
      Logger.e('Failed to detect Android devices:', error);
      return [];
    }
  }

  /**
   * Detect connected iOS devices.
   * Simulator-only: returns booted simulators from `simctl list devices booted --json`.
   */
  async getIOSDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await this._execFileFn('xcrun', [
        'simctl', 'list', 'devices', 'booted', '--json',
      ]);
      const parsed = JSON.parse(stdout.toString()) as {
        devices?: Record<string, Array<Record<string, unknown>>>;
      };
      const devices: DeviceInfo[] = [];

      for (const [runtime, runtimeDevices] of Object.entries(parsed.devices ?? {})) {
        const sdkVersion = this._parseRuntimeVersion(runtime);
        for (const device of runtimeDevices) {
          if (device['state'] !== 'Booted' || device['isAvailable'] === false) {
            continue;
          }

          const udid = typeof device['udid'] === 'string' ? device['udid'] : null;
          const name = typeof device['name'] === 'string' ? device['name'] : null;
          if (!udid) {
            continue;
          }

          devices.push(
            new DeviceInfo({
              id: udid,
              deviceUUID: udid,
              isAndroid: false,
              sdkVersion,
              name,
            }),
          );
        }
      }

      return devices;
    } catch (error) {
      Logger.d('iOS device detection unavailable:', error);
      return [];
    }
  }

  /**
   * Set up ADB port forwarding for a device.
   * Dart: Future<int> forwardPort(String deviceSerial, int port)
   */
  async forwardPort(
    adbPath: string,
    deviceSerial: string,
    devicePort: number,
  ): Promise<number> {
    const localPort = this._allocatePort(deviceSerial);

    await this._execFileFn(adbPath, [
      '-s', deviceSerial,
      'forward',
      `tcp:${localPort}`,
      `tcp:${devicePort}`,
    ]);

    Logger.d(`Port forwarded: localhost:${localPort} → ${deviceSerial}:${devicePort}`);
    return localPort;
  }

  /**
   * Remove port forwarding for a device.
   */
  async removePortForward(adbPath: string, deviceSerial: string): Promise<void> {
    const port = this._portMap.get(deviceSerial);
    if (port) {
      try {
        await this._execFileFn(adbPath, [
          '-s', deviceSerial,
          'forward', '--remove',
          `tcp:${port}`,
        ]);
      } catch {
        // ignore cleanup errors
      }
      this._portMap.delete(deviceSerial);
    }
  }

  /**
   * Get the forwarded port for a device.
   */
  getForwardedPort(deviceSerial: string): number | undefined {
    return this._portMap.get(deviceSerial);
  }

  /**
   * Install an APK on an Android device.
   */
  async installAndroidApp(
    adbPath: string,
    deviceSerial: string,
    apkPath: string,
  ): Promise<boolean> {
    try {
      await this._execFileFn(adbPath, [
        '-s', deviceSerial,
        'install', '-r', '-g',
        apkPath,
      ]);
      Logger.i(`Installed APK on ${deviceSerial}: ${apkPath}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to install APK on ${deviceSerial}:`, error);
      return false;
    }
  }

  /**
   * Uninstall a package from an Android device.
   */
  async uninstallAndroidApp(
    adbPath: string,
    deviceSerial: string,
    packageName: string,
  ): Promise<void> {
    try {
      await this._execFileFn(adbPath, ['-s', deviceSerial, 'uninstall', packageName]);
    } catch {
      // Package might not be installed — ignore
    }
  }

  /**
   * Install an .app bundle on a booted iOS simulator.
   */
  async installIOSApp(deviceId: string, appPath: string): Promise<boolean> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'install', deviceId, appPath]);
      Logger.i(`Installed iOS app on ${deviceId}: ${appPath}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to install iOS app on ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Open a deeplink on an Android device via ADB.
   */
  async openAndroidDeepLink(
    adbPath: string,
    deviceSerial: string,
    deeplink: string,
  ): Promise<boolean> {
    try {
      await this._execFileFn(adbPath, [
        '-s',
        deviceSerial,
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        deeplink,
      ]);
      Logger.i(`Opened Android deeplink on ${deviceSerial}: ${deeplink}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to open Android deeplink on ${deviceSerial}:`, error);
      return false;
    }
  }

  /**
   * Open a deeplink on a booted iOS simulator.
   */
  async openIOSDeepLink(deviceId: string, deeplink: string): Promise<boolean> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'openurl', deviceId, deeplink]);
      Logger.i(`Opened iOS deeplink on ${deviceId}: ${deeplink}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to open iOS deeplink on ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Terminate a running iOS simulator app. Ignore "not running" failures.
   */
  async terminateIOSApp(deviceId: string, bundleId: string): Promise<void> {
    try {
      await this._execFileFn('xcrun', ['simctl', 'terminate', deviceId, bundleId]);
    } catch (error) {
      Logger.d(`Ignoring iOS terminate failure for ${bundleId} on ${deviceId}:`, error);
    }
  }

  /**
   * List installed iOS simulator apps via `simctl listapps`.
   * Mirrors Dart IOSDriver.getInstalledApps().
   */
  async getIOSInstalledApps(deviceId: string): Promise<DeviceAppInfo[]> {
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

  /**
   * List installed iOS simulator bundle identifiers for updateAppIds().
   */
  async getIOSInstalledAppIds(deviceId: string): Promise<string[]> {
    const apps = await this.getIOSInstalledApps(deviceId);
    return DeviceAppInfo.getAppIdList(apps);
  }

  /**
   * Start the iOS driver runner and keep the child process attached for setup monitoring.
   */
  startIOSDriver(deviceId: string, port: number): IOSDriverProcessHandle {
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

  // ---------- private ----------

  private _allocatePort(deviceSerial: string): number {
    const existing = this._portMap.get(deviceSerial);
    if (existing) return existing;

    const port = this._nextPort++;
    this._portMap.set(deviceSerial, port);
    return port;
  }

  private _parseRuntimeVersion(runtime: string): number {
    const match = runtime.match(/iOS-(\d+)(?:-(\d+))?/i);
    if (!match) {
      return 0;
    }
    return parseInt(match[1], 10) || 0;
  }
}
