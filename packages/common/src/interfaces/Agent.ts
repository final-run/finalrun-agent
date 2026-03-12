// Port of common/interface/Agent.dart
// Dart: abstract class Agent → TypeScript: interface Agent
// Scoped to CLI usage only — excludes recording/streaming methods

import { DeviceActionRequest } from '../models/DeviceActionRequest.js';
import { DeviceInfo } from '../models/DeviceInfo.js';
import { DeviceNodeResponse } from '../models/DeviceNodeResponse.js';

/**
 * Abstract interface for anything that represents a connected device.
 * Implemented by Device in @finalrun/device-node.
 *
 * Dart equivalent: common/interface/Agent.dart
 */
export interface Agent {
  // Dart: Future<DeviceNodeResponse> setUp({bool reuseAddress = false})
  setUp(options?: { reuseAddress?: boolean }): Promise<DeviceNodeResponse>;

  // Dart: Future<DeviceNodeResponse> executeAction(DeviceActionRequest request)
  executeAction(request: DeviceActionRequest): Promise<DeviceNodeResponse>;

  // Dart: bool isConnected()
  isConnected(): boolean;

  // Dart: DeviceInfo getDeviceInfo()
  getDeviceInfo(): DeviceInfo;

  // Dart: Future<void> closeConnection()
  closeConnection(): Promise<void>;

  // Dart: void killDriver()
  killDriver(): void;

  // Dart: void setApiKey(String apiKey)
  setApiKey(apiKey: string): void;

  // Dart: String getId()
  getId(): string;

  // Dart: void listenForDeviceDisconnection(...)
  listenForDeviceDisconnection(callbacks: {
    onDeviceDisconnected: (deviceUUID: string, reason: string) => void;
  }): void;

  // Dart: void clearListener()
  clearListener(): void;

  // Dart: void uninstallDriver()
  uninstallDriver(): void;
}
