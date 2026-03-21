import type { ChildProcess } from 'child_process';
import type { DeviceNodeResponse, RecordingRequest } from '@finalrun/common';

export interface RecordingProvider {
  startRecordingProcess(params: {
    deviceId: string;
    filePath: string;
    recordingRequest: RecordingRequest;
    sdkVersion?: string;
  }): Promise<RecordingProviderResult>;

  stopRecordingProcess(params: {
    process: ChildProcess;
    deviceId: string;
    fileName: string;
    filePath: string;
  }): Promise<DeviceNodeResponse>;

  checkAvailability(): Promise<DeviceNodeResponse>;

  readonly recordingFolder: string;
  readonly platformName: string;
  readonly fileExtension: string;

  cleanupPlatformResources(deviceId: string): Promise<void>;
}

export interface RecordingProviderResult {
  process: ChildProcess;
  response: DeviceNodeResponse;
  platformMetadata?: Record<string, unknown>;
}
