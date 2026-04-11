// Barrel export for @finalrun/device-node

export { DeviceNode } from './DeviceNode.js';
export { Device } from './device/Device.js';
export { AndroidDevice } from './device/android/AndroidDevice.js';
export { IOSSimulator } from './device/ios/IOSSimulator.js';
export { CommonDriverActions } from './device/shared/CommonDriverActions.js';
export type {
  DeviceRuntime,
  DeviceScreenshotAndHierarchy,
} from './device/shared/DeviceRuntime.js';
export { DevicePool } from './device/DevicePool.js';
export { AndroidRecordingProvider } from './device/AndroidRecordingProvider.js';
export { IOSRecordingProvider } from './device/IOSRecordingProvider.js';
export { RecordingManager, defaultRecordingManager } from './device/RecordingManager.js';
export { LogCaptureManager, defaultLogCaptureManager } from './device/LogCaptureManager.js';
export type {
  DeviceLogCaptureController,
  LogCaptureSessionStartParams,
  LogCaptureStopOptions,
  LogCaptureCleanupOptions,
  LogCaptureAbortOptions,
} from './device/LogCaptureManager.js';
export type { LogCaptureProvider } from './device/LogCaptureProvider.js';
export { AndroidLogcatProvider } from './device/AndroidLogcatProvider.js';
export { IOSLogProvider } from './device/IOSLogProvider.js';
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
export { DeviceDiscoveryService } from './discovery/DeviceDiscoveryService.js';
export { AdbClient, isUndeclaredPermissionGrantFailure } from './infra/android/AdbClient.js';
export {
  SimctlClient,
  IOS_DRIVER_RUNNER_BUNDLE_ID,
} from './infra/ios/SimctlClient.js';
export type { IOSDriverProcessHandle } from './infra/ios/SimctlClient.js';
