// Port of device_node/lib/device/GrpcDriverSetup.dart
// Handles driver app installation and gRPC connection setup.
// MATCHES Dart logic: install → port forward → start driver (background) → poll with ping

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  DeviceAppInfo,
  DeviceInfo,
  Logger,
  DEFAULT_GRPC_PORT_START,
} from '@finalrun/common';
import type { FilePathUtil } from '@finalrun/common';
import { GrpcDriverClient } from './GrpcDriverClient.js';
import {
  DeviceManager,
  IOS_DRIVER_RUNNER_BUNDLE_ID,
  type IOSDriverProcessHandle,
} from '../device/DeviceManager.js';
import { Device } from '../device/Device.js';
import { waitForCaptureReadiness } from '../device/ScreenshotCapture.js';

const execFileAsync = promisify(execFile);

interface DriverStartupState {
  setupComplete: boolean;
  failureMessage: string | null;
  recentLogs: string[];
}

/**
 * Sets up the gRPC connection to a device's driver app.
 * Flow: install driver → port forward → start driver (background) → poll gRPC with ping.
 *
 * Dart equivalent: GrpcDriverSetup in device_node/lib/device/GrpcDriverSetup.dart
 */
export class GrpcDriverSetup {
  private _deviceManager: DeviceManager;
  private _filePathUtil: FilePathUtil;
  private _grpcClientFactory: () => GrpcDriverClient;
  private _delayFn: (ms: number) => Promise<void>;
  private _captureReadinessTimeoutMs: number;
  private _captureReadinessDelayMs: number;
  private _killStaleHostProcessesOnPortFn: (port: number) => Promise<void>;
  private _startAndroidDriverFn: (
    adbPath: string,
    deviceSerial: string,
    port: number,
  ) => void;

  constructor(params: {
    deviceManager: DeviceManager;
    filePathUtil: FilePathUtil;
    grpcClientFactory?: () => GrpcDriverClient;
    delayFn?: (ms: number) => Promise<void>;
    captureReadinessTimeoutMs?: number;
    captureReadinessDelayMs?: number;
    killStaleHostProcessesOnPortFn?: (port: number) => Promise<void>;
    startAndroidDriverFn?: (
      adbPath: string,
      deviceSerial: string,
      port: number,
    ) => void;
  }) {
    this._deviceManager = params.deviceManager;
    this._filePathUtil = params.filePathUtil;
    this._grpcClientFactory = params.grpcClientFactory ?? (() => new GrpcDriverClient());
    this._delayFn = params.delayFn ?? ((ms) => this._delay(ms));
    this._captureReadinessTimeoutMs = params.captureReadinessTimeoutMs ?? 15000;
    this._captureReadinessDelayMs = params.captureReadinessDelayMs ?? 500;
    this._killStaleHostProcessesOnPortFn =
      params.killStaleHostProcessesOnPortFn ??
      ((port) => this._killStaleHostProcessesOnPort(port));
    this._startAndroidDriverFn =
      params.startAndroidDriverFn ??
      ((adbPath, deviceSerial, port) =>
        this._startAndroidDriver(adbPath, deviceSerial, port));
  }

  /**
   * Set up a device: install driver → forward port → start driver → poll gRPC → return Device.
   */
  async setUp(deviceInfo: DeviceInfo): Promise<Device> {
    const grpcClient = this._grpcClientFactory();

    if (deviceInfo.isAndroid) {
      await this._setupAndroid(deviceInfo, grpcClient);
    } else {
      await this._setupIOS(deviceInfo, grpcClient);
    }

    return new Device({
      deviceInfo,
      grpcClient,
      getIOSInstalledApps: deviceInfo.isAndroid || !deviceInfo.id
        ? undefined
        : async () => await this._deviceManager.getIOSInstalledApps(deviceInfo.id!),
      refreshIOSAppIdsBeforeLaunch: deviceInfo.isAndroid || !deviceInfo.id
        ? undefined
        : async () => {
          await this._updateIOSAppIds(deviceInfo.id!, grpcClient, { throwOnFailure: false });
        },
      openDeepLink: deviceInfo.isAndroid
        ? async (deeplink) => {
          const adbPath = await this._filePathUtil.getADBPath();
          if (!adbPath || !deviceInfo.id) {
            Logger.e('ADB not available for Android deeplink execution.');
            return false;
          }
          return await this._deviceManager.openAndroidDeepLink(
            adbPath,
            deviceInfo.id,
            deeplink,
          );
        }
        : !deviceInfo.id
          ? undefined
          : async (deeplink) => {
            return await this._deviceManager.openIOSDeepLink(deviceInfo.id!, deeplink);
          },
    });
  }

  // ---------- private ----------

  private async _setupAndroid(
    deviceInfo: DeviceInfo,
    grpcClient: GrpcDriverClient,
  ): Promise<void> {
    const adbPath = await this._filePathUtil.getADBPath();
    if (!adbPath) {
      throw new Error('ADB not found. Please install Android SDK platform-tools.');
    }

    // Step 1: Install main app APK (app-debug.apk)
    const driverPath = await this._filePathUtil.getDriverAppPath();
    if (!driverPath) {
      throw new Error(
        'Driver app APK not found. Expected at resources/android/app-debug.apk. ' +
        'Copy from studio-flutter/device_node_server/executables/android/',
      );
    }

    Logger.i(`Installing driver app on ${deviceInfo.id}...`);
    const installed = await this._deviceManager.installAndroidApp(
      adbPath,
      deviceInfo.id!,
      driverPath,
    );
    if (!installed) {
      throw new Error('Failed to install driver app APK');
    }

    // Step 2: Install test runner APK (app-debug-androidTest.apk)
    const testAppPath = await this._filePathUtil.getDriverTestAppPath();
    if (testAppPath) {
      Logger.i(`Installing test runner APK on ${deviceInfo.id}...`);
      const testInstalled = await this._deviceManager.installAndroidApp(
        adbPath,
        deviceInfo.id!,
        testAppPath,
      );
      if (!testInstalled) {
        throw new Error('Failed to install test runner APK');
      }
    } else {
      Logger.w('Test runner APK not found — instrumentation may fail');
    }

    // Step 3: Remove old port forward and set up new one (BEFORE starting driver)
    // Dart: await driver.removePortForward(deviceId, port);
    //       await driver.forwardPortToLocal(deviceId, port);
    await this._deviceManager.removePortForward(adbPath, deviceInfo.id!);
    const localPort = await this._deviceManager.forwardPort(
      adbPath,
      deviceInfo.id!,
      DEFAULT_GRPC_PORT_START,
    );

    // Step 4: Start the driver instrumentation test in the background (non-blocking)
    // Dart: startDriverApp(deviceId).then((_) => { ... });
    Logger.i('Starting driver app...');
    this._startAndroidDriverFn(adbPath, deviceInfo.id!, localPort);

    // Step 5: Poll with ping until gRPC server responds (matches Dart: 240 attempts × 500ms = 120s)
    Logger.i(`Connecting gRPC to 127.0.0.1:${localPort}...`);
    // Note: Use '127.0.0.1' NOT 'localhost' — Node.js resolves 'localhost' to
    // IPv6 (::1) but ADB port forwarding binds to IPv4 (127.0.0.1).
    const connected = await this._connectWithPolling(grpcClient, '127.0.0.1', localPort);
    if (!connected) {
      throw new Error('Failed to connect to device via gRPC after 120s — driver did not start');
    }

    const captureReady = await waitForCaptureReadiness(grpcClient, {
      timeoutMs: this._captureReadinessTimeoutMs,
      delayMs: this._captureReadinessDelayMs,
    });
    if (!captureReady.ready) {
      throw new Error(
        `Driver started and gRPC connected, but UiAutomation never became ready for screenshot capture after ${this._captureReadinessTimeoutMs / 1000}s: ${captureReady.message ?? 'unknown capture readiness error'}`,
      );
    }

    Logger.i('gRPC connection established successfully');
  }

  private async _setupIOS(
    deviceInfo: DeviceInfo,
    grpcClient: GrpcDriverClient,
  ): Promise<void> {
    await this._filePathUtil.ensureIOSAppsAvailable();

    const driverPath = await this._filePathUtil.getIOSDriverAppPath();
    if (!driverPath) {
      throw new Error('iOS driver app not found.');
    }
    if (!deviceInfo.id) {
      throw new Error('iOS simulator ID is required for driver setup.');
    }

    Logger.i(`Installing iOS driver app on ${deviceInfo.id}...`);
    const installed = await this._deviceManager.installIOSApp(deviceInfo.id, driverPath);
    if (!installed) {
      throw new Error(`Failed to install iOS driver app: ${driverPath}`);
    }

    await this._killStaleHostProcessesOnPortFn(DEFAULT_GRPC_PORT_START);

    Logger.i(`Terminating existing iOS driver app on ${deviceInfo.id}...`);
    await this._deviceManager.terminateIOSApp(deviceInfo.id, IOS_DRIVER_RUNNER_BUNDLE_ID);

    Logger.i('Starting iOS driver app...');
    const driverProcess = this._deviceManager.startIOSDriver(
      deviceInfo.id,
      DEFAULT_GRPC_PORT_START,
    );
    const startupState = this._trackIOSDriverProcess(deviceInfo.id, driverProcess);

    Logger.i(`Connecting gRPC to iOS simulator at 127.0.0.1:${DEFAULT_GRPC_PORT_START}...`);
    const connected = await this._connectWithPolling(
      grpcClient,
      '127.0.0.1',
      DEFAULT_GRPC_PORT_START,
      {
        getStartupFailureMessage: () => startupState.failureMessage,
      },
    );
    if (!connected) {
      throw new Error('Failed to connect to iOS simulator via gRPC after 120s — driver did not start');
    }

    const captureReady = await waitForCaptureReadiness(grpcClient, {
      timeoutMs: this._captureReadinessTimeoutMs,
      delayMs: this._captureReadinessDelayMs,
    });
    if (!captureReady.ready) {
      if (startupState.failureMessage) {
        throw new Error(startupState.failureMessage);
      }
      throw new Error(
        `iOS driver started and gRPC connected, but screenshot capture never became ready after ${this._captureReadinessTimeoutMs / 1000}s: ${captureReady.message ?? 'unknown capture readiness error'}`,
      );
    }
    if (startupState.failureMessage) {
      throw new Error(startupState.failureMessage);
    }

    await this._updateIOSAppIds(deviceInfo.id, grpcClient, { throwOnFailure: true });

    startupState.setupComplete = true;
    Logger.i('iOS gRPC connection established successfully');
  }

  /**
   * Connects to the gRPC server with polling.
   * Matches Dart: creates channel once, then polls with ping().
   * 240 attempts × 500ms = 120 seconds total timeout.
   *
   * Dart: Future<bool> connectToDeviceGrpc()
   */
  private async _connectWithPolling(
    grpcClient: GrpcDriverClient,
    host: string,
    port: number,
    options?: {
      getStartupFailureMessage?: () => string | null;
    },
  ): Promise<boolean> {
    const maxAttempts = 240; // 120 seconds at 500ms intervals
    const delayMs = 500;

    Logger.d(`GrpcDriverSetup: Creating channel to ${host}:${port}`);

    // Create channel once (lazy — no network call yet)
    grpcClient.createChannel(host, port);

    // Poll with ping until server responds
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const startupFailure = options?.getStartupFailureMessage?.();
      if (startupFailure) {
        throw new Error(startupFailure);
      }

      if (attempt > 0 && attempt % 20 === 0) {
        Logger.i(
          `Still waiting for driver... (${(attempt * 500) / 1000}s)`,
        );
      }

      try {
        const connected = await grpcClient.ping();
        if (connected) {
          Logger.i(
            `Connected after ${attempt + 1} attempts (${((attempt + 1) * 500) / 1000}s)`,
          );
          return true;
        }
      } catch {
        // Ping failed — expected during startup, just retry
      }

      const postAttemptFailure = options?.getStartupFailureMessage?.();
      if (postAttemptFailure) {
        throw new Error(postAttemptFailure);
      }

      await this._delayFn(delayMs);
    }

    Logger.e('Failed to connect after 120s (driver did not start)');
    return false;
  }

  /**
   * Start the Android driver instrumentation test via ADB.
   * Runs in the background (non-blocking).
   *
   * Dart equivalent: AndroidDriver.startDriverApp() in AndroidDriver.dart:71-86
   * Command produced on device:
   *   am instrument -w -e port <PORT> -e app_perfect_device_id <DEVICE_ID>
   *     -e class "app.finalrun.android.FinalRunTest#testDriver"
   *     app.finalrun.android.test/androidx.test.runner.AndroidJUnitRunner
   */
  private _startAndroidDriver(
    adbPath: string,
    deviceSerial: string,
    port: number,
  ): void {
    const { spawn } = require('child_process');

    // Match Dart's AndroidDriver.startDriverApp() argument format exactly.
    // Dart uses combined strings like '-e port $port' as single args.
    // ADB's 'shell' subcommand joins remaining args into one shell command on the device.
    const args = [
      '-s', deviceSerial,
      'shell', 'am', 'instrument', '-w',
      '-e', 'port', String(port),
      '-e', 'app_perfect_device_id', deviceSerial,
      '-e', 'class', 'app.finalrun.android.FinalRunTest#testDriver',
      'app.finalrun.android.test/androidx.test.runner.AndroidJUnitRunner',
    ];

    Logger.d(`Starting driver: ${adbPath} ${args.join(' ')}`);

    const child = spawn(adbPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    // Log stdout/stderr for debugging
    child.stdout?.on('data', (data: Buffer) => {
      Logger.d(`Driver stdout: ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data: Buffer) => {
      Logger.d(`Driver stderr: ${data.toString().trim()}`);
    });

    child.on('exit', (code: number | null) => {
      Logger.i(`Driver app process ended with code ${code}`);
    });

    child.on('error', (err: Error) => {
      Logger.e(`Driver app process error: ${err.message}`);
    });
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private _trackIOSDriverProcess(
    deviceId: string,
    driverProcess: IOSDriverProcessHandle,
  ): DriverStartupState {
    const state: DriverStartupState = {
      setupComplete: false,
      failureMessage: null,
      recentLogs: [],
    };

    const appendLog = (source: 'stdout' | 'stderr', chunk: Buffer | string): void => {
      const text = chunk.toString().trim();
      if (!text) {
        return;
      }

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        Logger.d(`iOS driver ${source}: ${trimmed}`);
        state.recentLogs.push(`${source}: ${trimmed}`);
        if (state.recentLogs.length > 20) {
          state.recentLogs.shift();
        }
      }
    };

    driverProcess.stdout?.on('data', (chunk: Buffer | string) => appendLog('stdout', chunk));
    driverProcess.stderr?.on('data', (chunk: Buffer | string) => appendLog('stderr', chunk));

    driverProcess.on('error', (error: Error) => {
      state.failureMessage = `iOS driver process error for ${deviceId}: ${error.message}`;
      Logger.e(state.failureMessage);
    });

    driverProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      const exitDescription =
        code !== null ? `code ${code}` : signal ? `signal ${signal}` : 'unknown status';
      const logSuffix =
        state.recentLogs.length > 0 ? ` Logs: ${state.recentLogs.join(' | ')}` : '';

      if (!state.setupComplete) {
        state.failureMessage =
          `iOS driver process exited before setup completed (${exitDescription}) for ${deviceId}.${logSuffix}`;
        Logger.e(state.failureMessage);
      } else {
        Logger.i(`iOS driver process ended for ${deviceId} (${exitDescription})`);
      }
    });

    return state;
  }

  private async _killStaleHostProcessesOnPort(port: number): Promise<void> {
    try {
      const { stdout } = await execFileAsync('lsof', ['-ti', `:${port}`]);
      const pids = stdout
        .toString()
        .split('\n')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      for (const pid of pids) {
        const { stdout: processStdout } = await execFileAsync('ps', ['-p', pid, '-o', 'comm=']);
        const processName = processStdout.toString().trim();
        if (
          processName.includes('xcodebuild') ||
          processName.includes('XCTest') ||
          processName.includes('xctrunner') ||
          processName.includes('iosUITests')
        ) {
          Logger.i(`Killing stale process ${pid} (${processName}) on port ${port}`);
          await execFileAsync('kill', ['-9', pid]);
        }
      }
    } catch {
      // Port cleanup is best-effort for simulator startup.
    }
  }

  private async _updateIOSAppIds(
    deviceId: string,
    grpcClient: GrpcDriverClient,
    options: { throwOnFailure: boolean },
  ): Promise<void> {
    const apps = await this._deviceManager.getIOSInstalledApps(deviceId);
    const appIds = DeviceAppInfo.getAppIdList(apps);
    Logger.i(`Sending ${appIds.length} iOS app IDs to driver...`);

    const updateResponse = await grpcClient.updateAppIds(appIds);
    if (updateResponse.success) {
      return;
    }

    const message =
      `Failed to update iOS app IDs: ${updateResponse.message ?? 'unknown error'}`;
    if (options.throwOnFailure) {
      throw new Error(message);
    }
    Logger.w(message);
  }
}
