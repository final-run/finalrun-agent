import type { ChildProcess } from 'child_process';
import type { DeviceNodeResponse } from '@finalrun/common';

export interface LogCaptureProvider {
  startLogCapture(params: {
    deviceId: string;
    outputFilePath: string;
    appIdentifier?: string;
  }): Promise<{ process: ChildProcess; response: DeviceNodeResponse }>;

  stopLogCapture(params: {
    process: ChildProcess;
    outputFilePath: string;
  }): Promise<DeviceNodeResponse>;

  checkAvailability(): Promise<DeviceNodeResponse>;

  cleanupPlatformResources(deviceId: string): Promise<void>;

  readonly fileExtension: string;
  readonly platformName: string;
}
