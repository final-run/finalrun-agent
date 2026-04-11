import type { ChildProcess } from 'child_process';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import {
  DeviceNodeResponse,
  Logger,
  PLATFORM_ANDROID,
  PLATFORM_IOS,
} from '@finalrun/common';
import { AndroidLogcatProvider } from './AndroidLogcatProvider.js';
import { IOSLogProvider } from './IOSLogProvider.js';
import { LogInfo } from './LogInfo.js';
import type { LogCaptureProvider } from './LogCaptureProvider.js';

export interface LogCaptureSessionStartParams {
  deviceId: string;
  runId: string;
  testId: string;
  platform: string;
  appIdentifier?: string;
}

export interface LogCaptureStopOptions {
  platform: string;
  keepOutput?: boolean;
}

export interface LogCaptureCleanupOptions {
  platform: string;
  keepOutput?: boolean;
}

export interface LogCaptureAbortOptions {
  deviceId: string;
  platform: string;
  keepOutput?: boolean;
}

export interface DeviceLogCaptureController {
  startLogCapture(params: LogCaptureSessionStartParams): Promise<DeviceNodeResponse>;
  stopLogCapture(
    runId: string,
    testId: string,
    options: LogCaptureStopOptions,
  ): Promise<DeviceNodeResponse>;
  cleanupDevice(deviceId: string, options: LogCaptureCleanupOptions): Promise<void>;
  abortLogCapture(runId: string, options: LogCaptureAbortOptions): Promise<void>;
}

const MAP_KEY_DELIMITER = '###';

export class LogCaptureManager implements DeviceLogCaptureController {
  private readonly _logProcessMap = new Map<string, ChildProcess>();
  private readonly _logInfoMap = new Map<string, LogInfo>();
  private readonly _deviceToLogKeysMap = new Map<string, string[]>();
  private readonly _stoppedTestCases = new Set<string>();
  private readonly _providers: Map<string, LogCaptureProvider>;

  constructor(params?: {
    providers?: Record<string, LogCaptureProvider>;
    adbPath?: string;
  }) {
    const providers = params?.providers ?? {
      [PLATFORM_ANDROID]: new AndroidLogcatProvider({ adbPath: params?.adbPath }),
      [PLATFORM_IOS]: new IOSLogProvider(),
    };
    this._providers = new Map(Object.entries(providers));
  }

  getMapKey(runId: string, testId: string): string {
    return `${runId}${MAP_KEY_DELIMITER}${testId}`;
  }

  async startLogCapture(params: LogCaptureSessionStartParams): Promise<DeviceNodeResponse> {
    const mapKey = this.getMapKey(params.runId, params.testId);

    this._stoppedTestCases.delete(mapKey);
    if (this._logProcessMap.has(mapKey)) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Log capture already in progress for this test case',
      });
    }

    const provider = this._providers.get(params.platform);
    if (!provider) {
      return new DeviceNodeResponse({
        success: false,
        message: `Log capture is not configured for platform: ${params.platform}`,
      });
    }

    const availability = await provider.checkAvailability();
    if (!availability.success) {
      return availability;
    }

    const logDir = path.join(os.tmpdir(), 'finalrun-logs');
    await fsp.mkdir(logDir, { recursive: true });

    const sanitizedRunId = this._sanitizeForFilename(params.runId);
    const sanitizedTestId = this._sanitizeForFilename(params.testId);
    const filePath = path.join(logDir, `${sanitizedRunId}_${sanitizedTestId}.${provider.fileExtension}`);

    const logInfo = new LogInfo({
      deviceId: params.deviceId,
      filePath,
      runId: params.runId,
      testId: params.testId,
      platform: params.platform,
    });
    this._logInfoMap.set(mapKey, logInfo);
    this._deviceToLogKeysMap.set(params.deviceId, [
      ...(this._deviceToLogKeysMap.get(params.deviceId) ?? []),
      mapKey,
    ]);

    try {
      const providerResult = await provider.startLogCapture({
        deviceId: params.deviceId,
        outputFilePath: filePath,
        appIdentifier: params.appIdentifier,
      });

      if (!providerResult.response.success) {
        this._logInfoMap.delete(mapKey);
        this._removeDeviceLogKey(params.deviceId, mapKey);
        return providerResult.response;
      }

      this._logProcessMap.set(mapKey, providerResult.process);

      return new DeviceNodeResponse({
        success: true,
        message:
          providerResult.response.message ??
          `Log capture started successfully for test case: ${params.testId}`,
        data: {
          filePath,
          platform: params.platform,
          startedAt: logInfo.startTime.toISOString(),
        },
      });
    } catch (error) {
      this._logInfoMap.delete(mapKey);
      this._removeDeviceLogKey(params.deviceId, mapKey);
      Logger.e(
        `Failed to start log capture for test case: ${params.testId}`,
        error,
      );
      return new DeviceNodeResponse({
        success: false,
        message: `Failed to start log capture: ${this._formatError(error)}`,
      });
    }
  }

  async stopLogCapture(
    runId: string,
    testId: string,
    options: LogCaptureStopOptions,
  ): Promise<DeviceNodeResponse> {
    const mapKey = this.getMapKey(runId, testId);

    if (this._stoppedTestCases.has(mapKey)) {
      return new DeviceNodeResponse({
        success: true,
        message: 'Log capture already stopped for this test case',
      });
    }

    const process = this._logProcessMap.get(mapKey);
    if (!process) {
      return new DeviceNodeResponse({
        success: false,
        message: 'No active log capture found for this test case',
      });
    }

    const logInfo = this._logInfoMap.get(mapKey);
    if (!logInfo) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Log info not found',
      });
    }

    const provider = this._providers.get(options.platform);
    if (!provider) {
      return new DeviceNodeResponse({
        success: false,
        message: `Log capture is not configured for platform: ${options.platform}`,
      });
    }

    const stopResult = await provider.stopLogCapture({
      process,
      outputFilePath: logInfo.filePath,
    });

    this._finalizeStoppedLogCapture(mapKey, logInfo);

    if (!stopResult.success) {
      return stopResult;
    }

    if (options.keepOutput === false) {
      try {
        await fsp.rm(logInfo.filePath, { force: true });
      } catch (error) {
        Logger.w(
          `LogCaptureManager: Failed to delete local log file ${logInfo.filePath}: ${this._formatError(error)}`,
        );
      }

      return new DeviceNodeResponse({
        success: true,
        message: `Log capture aborted and cleaned up for test case: ${testId}`,
      });
    }

    return new DeviceNodeResponse({
      success: true,
      message: `Log capture stopped successfully for test case: ${testId}`,
      data: {
        filePath: logInfo.filePath,
        startedAt: logInfo.startTime.toISOString(),
        completedAt: logInfo.endTime?.toISOString() ?? new Date().toISOString(),
      },
    });
  }

  async cleanupDevice(deviceId: string, options: LogCaptureCleanupOptions): Promise<void> {
    const logKeys = [...(this._deviceToLogKeysMap.get(deviceId) ?? [])];
    for (const mapKey of logKeys) {
      const [runId, testId] = mapKey.split(MAP_KEY_DELIMITER);
      if (runId && testId) {
        await this.stopLogCapture(runId, testId, {
          platform: options.platform,
          keepOutput: options.keepOutput ?? false,
        });
      }
    }

    this._deviceToLogKeysMap.delete(deviceId);
    for (const mapKey of logKeys) {
      this._stoppedTestCases.delete(mapKey);
    }

    const provider = this._providers.get(options.platform);
    if (provider) {
      await provider.cleanupPlatformResources(deviceId);
    }
  }

  async abortLogCapture(
    runId: string,
    options: LogCaptureAbortOptions,
  ): Promise<void> {
    const matchingEntries = [...this._logInfoMap.entries()].filter(
      ([, logInfo]) =>
        logInfo.runId === runId && logInfo.deviceId === options.deviceId,
    );

    for (const [, logInfo] of matchingEntries) {
      await this.stopLogCapture(logInfo.runId, logInfo.testId, {
        platform: options.platform,
        keepOutput: options.keepOutput ?? false,
      });
    }
  }

  private _sanitizeForFilename(value: string): string {
    return value
      .replaceAll(/[/\\:*?"<>|]/g, '_')
      .replaceAll(/\s+/g, '_')
      .replaceAll(/_+/g, '_');
  }

  private _finalizeStoppedLogCapture(mapKey: string, logInfo: LogInfo): void {
    this._logProcessMap.delete(mapKey);
    this._stoppedTestCases.add(mapKey);
    this._removeDeviceLogKey(logInfo.deviceId, mapKey);
    logInfo.markAsEnded();
    this._logInfoMap.delete(mapKey);
  }

  private _removeDeviceLogKey(deviceId: string, mapKey: string): void {
    const keys = this._deviceToLogKeysMap.get(deviceId);
    if (!keys) {
      return;
    }

    const nextKeys = keys.filter((key) => key !== mapKey);
    if (nextKeys.length === 0) {
      this._deviceToLogKeysMap.delete(deviceId);
      return;
    }

    this._deviceToLogKeysMap.set(deviceId, nextKeys);
  }

  private _formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const defaultLogCaptureManager = new LogCaptureManager();
