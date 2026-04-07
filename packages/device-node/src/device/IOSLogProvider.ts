import { execFile, spawn, type ChildProcess } from 'child_process';
import * as fs from 'node:fs';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { DeviceNodeResponse, Logger, PLATFORM_IOS } from '@finalrun/common';
import type { LogCaptureProvider } from './LogCaptureProvider.js';

const execFileAsync = promisify(execFile);

type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

/**
 * iOS simulator log capture via `xcrun simctl spawn <udid> log stream --style compact`.
 */
export class IOSLogProvider implements LogCaptureProvider {
  private readonly _execFileFn: ExecFileFn;
  private readonly _spawnFn: typeof spawn;

  constructor(params?: {
    execFileFn?: ExecFileFn;
    spawnFn?: typeof spawn;
  }) {
    this._execFileFn = params?.execFileFn ?? execFileAsync;
    this._spawnFn = params?.spawnFn ?? spawn;
  }

  get fileExtension(): string {
    return 'log';
  }

  get platformName(): string {
    return PLATFORM_IOS;
  }

  async startLogCapture(params: {
    deviceId: string;
    outputFilePath: string;
  }): Promise<{ process: ChildProcess; response: DeviceNodeResponse }> {
    try {
      const writeStream = fs.createWriteStream(params.outputFilePath);
      const args = ['simctl', 'spawn', params.deviceId, 'log', 'stream', '--style', 'compact'];
      Logger.i(
        `IOSLogProvider: Starting log capture for device ${params.deviceId} with command: xcrun ${args.join(' ')}`,
      );

      const childProcess = this._spawnFn('xcrun', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as ChildProcess;

      childProcess.stdout?.pipe(writeStream);
      childProcess.stderr?.on('data', (data: Buffer | string) => {
        Logger.w(`xcrun simctl log stderr: ${String(data)}`);
      });

      return {
        process: childProcess,
        response: new DeviceNodeResponse({
          success: true,
          message: `iOS log capture started for device: ${params.deviceId}, file: ${params.outputFilePath}`,
        }),
      };
    } catch (error) {
      Logger.e(
        `IOSLogProvider: Failed to start log capture for device ${params.deviceId}:`,
        error,
      );
      throw new Error(
        `Failed to start iOS log capture for device ${params.deviceId}: ${this._formatError(error)}`,
      );
    }
  }

  async stopLogCapture(params: {
    process: ChildProcess;
    outputFilePath: string;
  }): Promise<DeviceNodeResponse> {
    try {
      const killSent = params.process.kill('SIGINT');
      Logger.i(`IOSLogProvider: Sent SIGINT to xcrun simctl log process: ${killSent}`);

      if (!killSent) {
        Logger.e(
          `IOSLogProvider: Failed to deliver SIGINT for log capture file: ${params.outputFilePath}`,
        );
        return new DeviceNodeResponse({
          success: false,
          message: 'Failed to send SIGINT to xcrun simctl log process.',
        });
      }

      const exitCode = await this._waitForExit(params.process);
      Logger.i(
        `IOSLogProvider: xcrun simctl log process exited with code ${exitCode} for file: ${params.outputFilePath}`,
      );

      // Flush and close the write stream piped from stdout
      if (params.process.stdout) {
        params.process.stdout.unpipe();
      }

      return new DeviceNodeResponse({
        success: true,
        message: `iOS log capture stopped successfully for file: ${params.outputFilePath}`,
      });
    } catch (error) {
      Logger.e(
        `IOSLogProvider: Error stopping log capture for file: ${params.outputFilePath}`,
        error,
      );
      return new DeviceNodeResponse({
        success: false,
        message: `Error stopping iOS log capture: ${this._formatError(error)}`,
      });
    }
  }

  async checkAvailability(): Promise<DeviceNodeResponse> {
    try {
      await this._execFileFn('which', ['xcrun']);
      await this._execFileFn('xcrun', ['simctl', 'help']);
      return new DeviceNodeResponse({
        success: true,
        message: 'iOS log capture tools (xcrun simctl) are available.',
      });
    } catch (error) {
      Logger.e('IOSLogProvider: Error checking xcrun availability', error);
      return new DeviceNodeResponse({
        success: false,
        message: `xcrun not found. Please ensure Xcode command line tools are installed: ${this._formatError(error)}`,
      });
    }
  }

  async cleanupPlatformResources(deviceId: string): Promise<void> {
    Logger.i(`IOSLogProvider: Cleaning up resources for device: ${deviceId}`);
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
