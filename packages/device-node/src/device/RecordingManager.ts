import type { ChildProcess } from 'child_process';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import {
  DeviceNodeResponse,
  Logger,
  PLATFORM_ANDROID,
  PLATFORM_IOS,
  type RecordingRequest,
} from '@finalrun/common';
import { AndroidRecordingProvider } from './AndroidRecordingProvider.js';
import { IOSRecordingProvider } from './IOSRecordingProvider.js';
import { RecordingInfo } from './RecordingInfo.js';
import type { RecordingProvider } from './RecordingProvider.js';

export interface RecordingSessionStartParams {
  deviceId: string;
  recordingRequest: RecordingRequest;
  platform: string;
  sdkVersion?: string;
}

export interface RecordingStopOptions {
  platform: string;
  keepOutput?: boolean;
}

export interface RecordingCleanupOptions {
  platform: string;
  keepOutput?: boolean;
}

export interface RecordingAbortOptions {
  deviceId: string;
  platform: string;
  keepOutput?: boolean;
}

export interface DeviceRecordingController {
  startRecording(params: RecordingSessionStartParams): Promise<DeviceNodeResponse>;
  stopRecording(
    runId: string,
    testId: string,
    options: RecordingStopOptions,
  ): Promise<DeviceNodeResponse>;
  cleanupDevice(deviceId: string, options: RecordingCleanupOptions): Promise<void>;
  abortRecording(runId: string, options: RecordingAbortOptions): Promise<void>;
}

const MAP_KEY_DELIMITER = '###';

export class RecordingManager implements DeviceRecordingController {
  private readonly _recordingProcessMap = new Map<string, ChildProcess>();
  private readonly _recordingInfoMap = new Map<string, RecordingInfo>();
  private readonly _deviceToRecordingKeysMap = new Map<string, string[]>();
  private readonly _stoppedTestCases = new Set<string>();
  private readonly _providers: Map<string, RecordingProvider>;
  private readonly _cwdProvider: () => string;

  constructor(params?: {
    providers?: Record<string, RecordingProvider>;
    cwdProvider?: () => string;
  }) {
    const providers = params?.providers ?? {
      [PLATFORM_ANDROID]: new AndroidRecordingProvider(),
      [PLATFORM_IOS]: new IOSRecordingProvider(),
    };
    this._providers = new Map(Object.entries(providers));
    this._cwdProvider = params?.cwdProvider ?? (() => process.cwd());
  }

  getMapKey(runId: string, testId: string): string {
    return `${runId}${MAP_KEY_DELIMITER}${testId}`;
  }

  async startRecording(params: RecordingSessionStartParams): Promise<DeviceNodeResponse> {
    const mapKey = this.getMapKey(
      params.recordingRequest.runId,
      params.recordingRequest.testId,
    );

    this._stoppedTestCases.delete(mapKey);
    if (this._recordingProcessMap.has(mapKey)) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Recording already in progress for this test case',
      });
    }

    const provider = this._providers.get(params.platform);
    if (!provider) {
      return new DeviceNodeResponse({
        success: false,
        message: `Screen recording is not configured for platform: ${params.platform}`,
      });
    }

    const explicitOutputPath = params.recordingRequest.outputFilePath
      ? path.resolve(params.recordingRequest.outputFilePath)
      : undefined;
    const recordingDir = explicitOutputPath
      ? path.dirname(explicitOutputPath)
      : path.resolve(this._cwdProvider(), provider.recordingFolder);
    await fsp.mkdir(recordingDir, { recursive: true });

    const sanitizedTestRunId = this._sanitizeForFilename(params.recordingRequest.runId);
    const sanitizedTestCaseId = this._sanitizeForFilename(
      params.recordingRequest.testId,
    );
    const fallbackFileName =
      `${sanitizedTestRunId}_${sanitizedTestCaseId}.${provider.fileExtension}`;
    const filePath = explicitOutputPath ?? path.join(recordingDir, fallbackFileName);
    const fileName = path.basename(filePath);

    const recordingInfo = new RecordingInfo({
      deviceId: params.deviceId,
      fileName,
      filePath,
      runId: params.recordingRequest.runId,
      testId: params.recordingRequest.testId,
      platform: params.platform,
      apiKey: params.recordingRequest.apiKey,
    });
    this._recordingInfoMap.set(mapKey, recordingInfo);
    this._deviceToRecordingKeysMap.set(params.deviceId, [
      ...(this._deviceToRecordingKeysMap.get(params.deviceId) ?? []),
      mapKey,
    ]);

    try {
      const providerResult = await provider.startRecordingProcess({
        deviceId: params.deviceId,
        filePath,
        recordingRequest: params.recordingRequest,
        sdkVersion: params.sdkVersion,
      });

      if (!providerResult.response.success) {
        this._recordingInfoMap.delete(mapKey);
        this._removeDeviceRecordingKey(params.deviceId, mapKey);
        return providerResult.response;
      }

      this._recordingProcessMap.set(mapKey, providerResult.process);

      return new DeviceNodeResponse({
        success: true,
        message:
          providerResult.response.message ??
          `Recording started successfully for test case: ${params.recordingRequest.testId}`,
        data: {
          fileName,
          filePath,
          platform: params.platform,
          startedAt: recordingInfo.startTime.toISOString(),
          ...(providerResult.platformMetadata
            ? { platformMetadata: providerResult.platformMetadata }
            : {}),
        },
      });
    } catch (error) {
      this._recordingInfoMap.delete(mapKey);
      this._removeDeviceRecordingKey(params.deviceId, mapKey);
      Logger.e(
        `Failed to start recording for test case: ${params.recordingRequest.testId}`,
        error,
      );
      return new DeviceNodeResponse({
        success: false,
        message: `Failed to start recording: ${this._formatError(error)}`,
      });
    }
  }

  async stopRecording(
    runId: string,
    testId: string,
    options: RecordingStopOptions,
  ): Promise<DeviceNodeResponse> {
    const mapKey = this.getMapKey(runId, testId);

    if (this._stoppedTestCases.has(mapKey)) {
      return new DeviceNodeResponse({
        success: true,
        message: 'Recording already stopped for this test case',
      });
    }

    const process = this._recordingProcessMap.get(mapKey);
    if (!process) {
      return new DeviceNodeResponse({
        success: false,
        message: 'No active recording found for this test case',
      });
    }

    const recordingInfo = this._recordingInfoMap.get(mapKey);
    if (!recordingInfo) {
      return new DeviceNodeResponse({
        success: false,
        message: 'Recording info not found',
      });
    }

    const provider = this._providers.get(options.platform);
    if (!provider) {
      return new DeviceNodeResponse({
        success: false,
        message: `Screen recording is not configured for platform: ${options.platform}`,
      });
    }

    const stopResult = await provider.stopRecordingProcess({
      process,
      deviceId: recordingInfo.deviceId,
      fileName: path.parse(recordingInfo.fileName).name,
      filePath: recordingInfo.filePath,
    });
    if (!stopResult.success) {
      if (await this._shouldPreserveFailedStopOutput(process, recordingInfo, options)) {
        this._finalizeStoppedRecording(mapKey, recordingInfo);
      }
      return stopResult;
    }

    this._finalizeStoppedRecording(mapKey, recordingInfo);

    if (options.keepOutput === false) {
      try {
        await fsp.rm(recordingInfo.filePath, { force: true });
      } catch (error) {
        Logger.w(
          `RecordingManager: Failed to delete local recording file ${recordingInfo.filePath}: ${this._formatError(error)}`,
        );
      }

      return new DeviceNodeResponse({
        success: true,
        message: `Recording aborted and cleaned up for test case: ${testId}`,
      });
    }

    return new DeviceNodeResponse({
      success: true,
      message: `Recording stopped successfully for test case: ${testId}`,
      data: {
        fileName: recordingInfo.fileName,
        filePath: recordingInfo.filePath,
        startedAt: recordingInfo.startTime.toISOString(),
        completedAt: recordingInfo.endTime?.toISOString() ?? new Date().toISOString(),
      },
    });
  }

  async cleanupDevice(deviceId: string, options: RecordingCleanupOptions): Promise<void> {
    const recordingKeys = [...(this._deviceToRecordingKeysMap.get(deviceId) ?? [])];
    for (const mapKey of recordingKeys) {
      const [runId, testId] = mapKey.split(MAP_KEY_DELIMITER);
      if (runId && testId) {
        await this.stopRecording(runId, testId, {
          platform: options.platform,
          keepOutput: options.keepOutput ?? false,
        });
      }
    }

    this._deviceToRecordingKeysMap.delete(deviceId);
    for (const mapKey of recordingKeys) {
      this._stoppedTestCases.delete(mapKey);
    }

    const provider = this._providers.get(options.platform);
    if (provider) {
      await provider.cleanupPlatformResources(deviceId);
    }
  }

  async abortRecording(
    runId: string,
    options: RecordingAbortOptions,
  ): Promise<void> {
    const matchingEntries = [...this._recordingInfoMap.entries()].filter(
      ([, recordingInfo]) =>
        recordingInfo.runId === runId && recordingInfo.deviceId === options.deviceId,
    );

    for (const [, recordingInfo] of matchingEntries) {
      await this.stopRecording(recordingInfo.runId, recordingInfo.testId, {
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

  private _finalizeStoppedRecording(mapKey: string, recordingInfo: RecordingInfo): void {
    this._recordingProcessMap.delete(mapKey);
    this._stoppedTestCases.add(mapKey);
    this._removeDeviceRecordingKey(recordingInfo.deviceId, mapKey);
    recordingInfo.markAsEnded();
    this._recordingInfoMap.delete(mapKey);
  }

  private async _shouldPreserveFailedStopOutput(
    process: ChildProcess,
    recordingInfo: RecordingInfo,
    options: RecordingStopOptions,
  ): Promise<boolean> {
    if (options.keepOutput === false || process.exitCode === null) {
      return false;
    }

    try {
      await fsp.access(recordingInfo.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private _removeDeviceRecordingKey(deviceId: string, mapKey: string): void {
    const keys = this._deviceToRecordingKeysMap.get(deviceId);
    if (!keys) {
      return;
    }

    const nextKeys = keys.filter((key) => key !== mapKey);
    if (nextKeys.length === 0) {
      this._deviceToRecordingKeysMap.delete(deviceId);
      return;
    }

    this._deviceToRecordingKeysMap.set(deviceId, nextKeys);
  }

  private _formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const defaultRecordingManager = new RecordingManager();
