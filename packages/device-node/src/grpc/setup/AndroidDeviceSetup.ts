import {
  DEFAULT_GRPC_PORT_START,
  DeviceInfo,
  Logger,
  type FilePathUtil,
} from '@finalrun/common';
import { waitForDriverCaptureReadiness } from '../../capture/ScreenshotCaptureCoordinator.js';
import type { AdbClient } from '../../infra/android/AdbClient.js';
import type { GrpcDriverClient } from '../GrpcDriverClient.js';

export class AndroidDeviceSetup {
  private _adbClient: AdbClient;
  private _filePathUtil: FilePathUtil;
  private _connectWithPolling: (
    grpcClient: GrpcDriverClient,
    host: string,
    port: number,
    options?: {
      getStartupFailureMessage?: () => string | null;
    },
  ) => Promise<boolean>;
  private _startAndroidDriverFn: (
    adbPath: string,
    deviceSerial: string,
    port: number,
  ) => void;
  private _captureReadinessTimeoutMs: number;
  private _captureReadinessDelayMs: number;

  constructor(params: {
    adbClient: AdbClient;
    filePathUtil: FilePathUtil;
    connectWithPolling: (
      grpcClient: GrpcDriverClient,
      host: string,
      port: number,
      options?: {
        getStartupFailureMessage?: () => string | null;
      },
    ) => Promise<boolean>;
    startAndroidDriverFn: (
      adbPath: string,
      deviceSerial: string,
      port: number,
    ) => void;
    captureReadinessTimeoutMs: number;
    captureReadinessDelayMs: number;
  }) {
    this._adbClient = params.adbClient;
    this._filePathUtil = params.filePathUtil;
    this._connectWithPolling = params.connectWithPolling;
    this._startAndroidDriverFn = params.startAndroidDriverFn;
    this._captureReadinessTimeoutMs = params.captureReadinessTimeoutMs;
    this._captureReadinessDelayMs = params.captureReadinessDelayMs;
  }

  async prepare(
    deviceInfo: DeviceInfo,
    grpcClient: GrpcDriverClient,
  ): Promise<{ adbPath: string; deviceSerial: string }> {
    const deviceSerial = deviceInfo.id;
    if (!deviceSerial) {
      throw new Error('Android device serial is required for driver setup.');
    }

    const adbPath = await this._filePathUtil.getADBPath();
    if (!adbPath) {
      throw new Error('ADB not found. Please install Android SDK platform-tools.');
    }

    const driverPath = await this._filePathUtil.getDriverAppPath();
    if (!driverPath) {
      throw new Error(
        'Driver app APK not found. Expected at resources/android/app-debug.apk. ' +
        'Copy from studio-flutter/device_node_server/executables/android/',
      );
    }

    Logger.i(`Installing driver app on ${deviceSerial}...`);
    const installed = await this._adbClient.installApp(
      adbPath,
      deviceSerial,
      driverPath,
    );
    if (!installed) {
      throw new Error('Failed to install driver app APK');
    }

    const testAppPath = await this._filePathUtil.getDriverTestAppPath();
    if (testAppPath) {
      Logger.i(`Installing test runner APK on ${deviceSerial}...`);
      const testInstalled = await this._adbClient.installApp(
        adbPath,
        deviceSerial,
        testAppPath,
      );
      if (!testInstalled) {
        throw new Error('Failed to install test runner APK');
      }
    } else {
      Logger.w('Test runner APK not found - instrumentation may fail');
    }

    await this._adbClient.removePortForward(adbPath, deviceSerial);
    const localPort = await this._adbClient.forwardPort(
      adbPath,
      deviceSerial,
      DEFAULT_GRPC_PORT_START,
    );

    Logger.i('Starting driver app...');
    this._startAndroidDriverFn(adbPath, deviceSerial, localPort);

    Logger.i(`Connecting gRPC to 127.0.0.1:${localPort}...`);
    const connected = await this._connectWithPolling(
      grpcClient,
      '127.0.0.1',
      localPort,
    );
    if (!connected) {
      throw new Error('Failed to connect to device via gRPC after 120s - driver did not start');
    }

    const captureReady = await waitForDriverCaptureReadiness(grpcClient, {
      timeoutMs: this._captureReadinessTimeoutMs,
      delayMs: this._captureReadinessDelayMs,
    });
    if (!captureReady.ready) {
      throw new Error(
        `Driver started and gRPC connected, but UiAutomation never became ready for screenshot capture after ${this._captureReadinessTimeoutMs / 1000}s: ${captureReady.message ?? 'unknown capture readiness error'}`,
      );
    }

    Logger.i('gRPC connection established successfully');
    return { adbPath, deviceSerial };
  }
}
