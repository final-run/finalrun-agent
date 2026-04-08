import { execFile, spawn, type ChildProcess } from 'child_process';
import * as fs from 'node:fs';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { DeviceNodeResponse, Logger, PLATFORM_ANDROID } from '@finalrun/common';
import type { LogCaptureProvider } from './LogCaptureProvider.js';

const execFileAsync = promisify(execFile);

type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

/**
 * Android device log capture via `adb logcat`.
 * Clears the ring buffer before capture, then streams in threadtime format.
 */
export class AndroidLogcatProvider implements LogCaptureProvider {
  private readonly _execFileFn: ExecFileFn;
  private readonly _spawnFn: typeof spawn;
  private readonly _adbPath: string;

  constructor(params?: {
    execFileFn?: ExecFileFn;
    spawnFn?: typeof spawn;
    adbPath?: string;
  }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
    this._spawnFn = params?.spawnFn ?? spawn;
    this._adbPath = params?.adbPath ?? 'adb';
  }

  get fileExtension(): string {
    return 'log';
  }

  get platformName(): string {
    return PLATFORM_ANDROID;
  }

  async startLogCapture(params: {
    deviceId: string;
    outputFilePath: string;
    appIdentifier?: string;
  }): Promise<{ process: ChildProcess; response: DeviceNodeResponse }> {
    try {
      // Clear the logcat ring buffer before capture
      await this._execFileFn(this._adbPath, ['-s', params.deviceId, 'logcat', '-c']);
      Logger.i(
        `AndroidLogcatProvider: Cleared logcat ring buffer for device ${params.deviceId}`,
      );

      const writeStream = fs.createWriteStream(params.outputFilePath);
      const args = ['-s', params.deviceId, 'logcat', '-v', 'threadtime'];

      if (params.appIdentifier) {
        try {
          const { stdout } = await this._execFileFn(this._adbPath, [
            '-s', params.deviceId, 'shell', 'pidof', params.appIdentifier,
          ]);
          const pids = String(stdout).trim().split(/\s+/).filter(Boolean);
          for (const pid of pids) {
            args.push('--pid', pid);
          }
          if (pids.length > 0) {
            Logger.i(
              `AndroidLogcatProvider: Filtering by PID(s) ${pids.join(', ')} for package ${params.appIdentifier}`,
            );
          } else {
            Logger.w(
              `AndroidLogcatProvider: pidof returned no PIDs for ${params.appIdentifier}, capturing all logs`,
            );
          }
        } catch {
          Logger.w(
            `AndroidLogcatProvider: Failed to resolve PID for ${params.appIdentifier}, capturing all logs`,
          );
        }
      }

      Logger.i(
        `AndroidLogcatProvider: Starting log capture for device ${params.deviceId} with command: adb ${args.join(' ')}`,
      );

      const childProcess = this._spawnFn(this._adbPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as ChildProcess;

      childProcess.stdout?.pipe(writeStream);
      childProcess.stderr?.on('data', (data: Buffer | string) => {
        Logger.w(`adb logcat stderr: ${String(data)}`);
      });

      return {
        process: childProcess,
        response: new DeviceNodeResponse({
          success: true,
          message: `Android log capture started for device: ${params.deviceId}, file: ${params.outputFilePath}`,
        }),
      };
    } catch (error) {
      Logger.e(
        `AndroidLogcatProvider: Failed to start log capture for device ${params.deviceId}:`,
        error,
      );
      throw new Error(
        `Failed to start Android log capture for device ${params.deviceId}: ${this._formatError(error)}`,
      );
    }
  }

  async stopLogCapture(params: {
    process: ChildProcess;
    outputFilePath: string;
  }): Promise<DeviceNodeResponse> {
    try {
      const killSent = params.process.kill('SIGINT');
      Logger.i(`AndroidLogcatProvider: Sent SIGINT to adb logcat process: ${killSent}`);

      if (!killSent) {
        Logger.e(
          `AndroidLogcatProvider: Failed to deliver SIGINT for log capture file: ${params.outputFilePath}`,
        );
        return new DeviceNodeResponse({
          success: false,
          message: 'Failed to send SIGINT to adb logcat process.',
        });
      }

      const exitCode = await this._waitForExit(params.process);
      Logger.i(
        `AndroidLogcatProvider: adb logcat process exited with code ${exitCode} for file: ${params.outputFilePath}`,
      );

      // Flush and close the write stream piped from stdout
      if (params.process.stdout) {
        params.process.stdout.unpipe();
      }

      return new DeviceNodeResponse({
        success: true,
        message: `Android log capture stopped successfully for file: ${params.outputFilePath}`,
      });
    } catch (error) {
      Logger.e(
        `AndroidLogcatProvider: Error stopping log capture for file: ${params.outputFilePath}`,
        error,
      );
      return new DeviceNodeResponse({
        success: false,
        message: `Error stopping Android log capture: ${this._formatError(error)}`,
      });
    }
  }

  async checkAvailability(): Promise<DeviceNodeResponse> {
    try {
      await this._execFileFn('which', [this._adbPath]);
      return new DeviceNodeResponse({
        success: true,
        message: 'Android log capture tools (adb) are available.',
      });
    } catch (error) {
      Logger.e('AndroidLogcatProvider: Error checking adb availability', error);
      return new DeviceNodeResponse({
        success: false,
        message: `adb not found. Please ensure Android SDK platform-tools are installed: ${this._formatError(error)}`,
      });
    }
  }

  async cleanupPlatformResources(deviceId: string): Promise<void> {
    Logger.i(`AndroidLogcatProvider: Cleaning up resources for device: ${deviceId}`);
  }

  private async _waitForExit(process: ChildProcess): Promise<number | null> {
    if (process.exitCode !== null) {
      return process.exitCode;
    }

    const [code] = await once(process, 'exit');
    return (code as number | null) ?? null;
  }

  private _formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
