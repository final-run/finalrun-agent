// Barrel export for @finalrun/device-node

export { DeviceNode } from './DeviceNode.js';
export { Device } from './device/Device.js';
export { DeviceManager } from './device/DeviceManager.js';
export { DevicePool } from './device/DevicePool.js';
export { AndroidRecordingProvider } from './device/AndroidRecordingProvider.js';
export { IOSRecordingProvider } from './device/IOSRecordingProvider.js';
export { RecordingManager, defaultRecordingManager } from './device/RecordingManager.js';
export type {
  DeviceRecordingController,
  RecordingSessionStartParams,
  RecordingStopOptions,
  RecordingCleanupOptions,
  RecordingAbortOptions,
} from './device/RecordingManager.js';
export type {
  RecordingProvider,
  RecordingProviderResult,
} from './device/RecordingProvider.js';
export { GrpcDriverClient } from './grpc/GrpcDriverClient.js';
export type {
  GrpcResponse,
  GrpcScreenshotResponse,
  GrpcRawScreenshotResponse,
  GrpcAppListResponse,
  GrpcDeviceScaleResponse,
  GrpcScreenDimensionResponse,
  GrpcRotateResponse,
} from './grpc/GrpcDriverClient.js';
export { GrpcDriverSetup } from './grpc/GrpcDriverSetup.js';
