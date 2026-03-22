import { execFile } from 'child_process';
import { promisify } from 'util';
import { DeviceInfo, Logger } from '@finalrun/common';

const execFileAsync = promisify(execFile);

type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export class DeviceDiscoveryService {
  private _execFileFn: ExecFileFn;

  constructor(params?: { execFileFn?: ExecFileFn }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
  }

  async getAndroidDevices(adbPath: string): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await this._execFileFn(adbPath, ['devices', '-l']);
      const lines = stdout.toString().split('\n').filter((line) => line.includes('device '));
      const devices: DeviceInfo[] = [];

      for (const line of lines) {
        const serial = line.split(/\s+/)[0];
        if (!serial || serial === 'List') {
          continue;
        }

        let sdkVersion = 0;
        try {
          const { stdout: sdkOut } = await this._execFileFn(adbPath, [
            '-s',
            serial,
            'shell',
            'getprop',
            'ro.build.version.sdk',
          ]);
          sdkVersion = parseInt(sdkOut.toString().trim(), 10) || 0;
        } catch {
          // Ignore per-device property fetch failures.
        }

        let name: string | null = null;
        try {
          const { stdout: nameOut } = await this._execFileFn(adbPath, [
            '-s',
            serial,
            'shell',
            'getprop',
            'ro.product.model',
          ]);
          name = nameOut.toString().trim() || null;
        } catch {
          // Ignore per-device property fetch failures.
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

  async getIOSDevices(): Promise<DeviceInfo[]> {
    try {
      const { stdout } = await this._execFileFn('xcrun', [
        'simctl',
        'list',
        'devices',
        'booted',
        '--json',
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

  private _parseRuntimeVersion(runtime: string): number {
    const match = runtime.match(/iOS-(\d+)(?:-(\d+))?/i);
    if (!match) {
      return 0;
    }

    return parseInt(match[1], 10) || 0;
  }
}
