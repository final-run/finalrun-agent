import { execFile } from 'child_process';
import { promisify } from 'util';
import { DEFAULT_GRPC_PORT_START, Logger } from '@finalrun/common';

const execFileAsync = promisify(execFile);

type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export interface AndroidSwipeParams {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
}

export class AdbClient {
  private _nextPort: number = DEFAULT_GRPC_PORT_START;
  private _portMap: Map<string, number> = new Map();
  private _execFileFn: ExecFileFn;

  constructor(params?: { execFileFn?: ExecFileFn }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
  }

  async forwardPort(
    adbPath: string,
    deviceSerial: string,
    devicePort: number,
  ): Promise<number> {
    const localPort = this._allocatePort(deviceSerial);

    await this._execFileFn(adbPath, [
      '-s',
      deviceSerial,
      'forward',
      `tcp:${localPort}`,
      `tcp:${devicePort}`,
    ]);

    Logger.d(`Port forwarded: localhost:${localPort} -> ${deviceSerial}:${devicePort}`);
    return localPort;
  }

  async removePortForward(adbPath: string, deviceSerial: string): Promise<void> {
    const port = this._portMap.get(deviceSerial);
    if (port === undefined) {
      return;
    }

    try {
      await this._execFileFn(adbPath, [
        '-s',
        deviceSerial,
        'forward',
        '--remove',
        `tcp:${port}`,
      ]);
    } catch {
      // Ignore best-effort cleanup failures.
    }

    this._portMap.delete(deviceSerial);
  }

  getForwardedPort(deviceSerial: string): number | undefined {
    return this._portMap.get(deviceSerial);
  }

  async installApp(
    adbPath: string,
    deviceSerial: string,
    apkPath: string,
  ): Promise<boolean> {
    try {
      await this._execFileFn(adbPath, [
        '-s',
        deviceSerial,
        'install',
        '-r',
        '-g',
        apkPath,
      ]);
      Logger.i(`Installed APK on ${deviceSerial}: ${apkPath}`);
      return true;
    } catch (error) {
      Logger.e(`Failed to install APK on ${deviceSerial}:`, error);
      return false;
    }
  }

  async uninstallApp(
    adbPath: string,
    deviceSerial: string,
    packageName: string,
  ): Promise<void> {
    try {
      await this._execFileFn(adbPath, ['-s', deviceSerial, 'uninstall', packageName]);
    } catch {
      // Package might not be installed.
    }
  }

  async openDeepLink(
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

  async swipe(
    adbPath: string,
    deviceSerial: string,
    params: AndroidSwipeParams,
  ): Promise<{ success: boolean; message?: string }> {
    try {
      await this._execFileFn(adbPath, [
        '-s',
        deviceSerial,
        'shell',
        'input',
        'swipe',
        String(params.startX),
        String(params.startY),
        String(params.endX),
        String(params.endY),
        String(params.durationMs),
      ]);
      Logger.d(
        `Performed Android swipe on ${deviceSerial}: (${params.startX},${params.startY}) -> (${params.endX},${params.endY}) in ${params.durationMs}ms`,
      );
      return { success: true };
    } catch (error) {
      const stderr =
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        (typeof (error as { stderr?: unknown }).stderr === 'string' ||
          Buffer.isBuffer((error as { stderr?: unknown }).stderr))
          ? (error as { stderr?: string | Buffer }).stderr?.toString().trim()
          : '';
      const message = stderr || (error instanceof Error ? error.message : String(error));
      Logger.e(`Failed to perform Android swipe on ${deviceSerial}:`, error);
      return {
        success: false,
        message: `Android swipe failed: ${message}`,
      };
    }
  }

  private _allocatePort(deviceSerial: string): number {
    const existingPort = this._portMap.get(deviceSerial);
    if (existingPort !== undefined) {
      return existingPort;
    }

    const port = this._nextPort++;
    this._portMap.set(deviceSerial, port);
    return port;
  }
}
