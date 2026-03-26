import {
  DEFAULT_GRPC_PORT_START,
  DeviceInfo,
  Logger,
  type FilePathUtil,
} from '@finalrun/common';
import { waitForDriverCaptureReadiness } from '../../capture/ScreenshotCaptureCoordinator.js';
import {
  ANDROID_DRIVER_APP_PACKAGE_NAME,
  ANDROID_DRIVER_TEST_PACKAGE_NAME,
  type AdbClient,
} from '../../infra/android/AdbClient.js';
import type { GrpcDriverClient } from '../GrpcDriverClient.js';

export interface AndroidDriverProcessHandle {
  pid?: number;
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

interface AndroidDriverStartupState {
  setupComplete: boolean;
  failureMessage: string | null;
  recentLogs: string[];
  processEnded: boolean;
  exitDescription: string | null;
  pid?: number;
}

export class AndroidDeviceSetup {
  private _adbClient: AdbClient;
  private _filePathUtil: FilePathUtil;
  private _connectWithPolling: (
    grpcClient: GrpcDriverClient,
    host: string,
    port: number,
    options?: {
      getStartupFailureMessage?: () => string | null;
      getWaitStatusMessage?: () => string | null;
      getTimeoutMessage?: () => string | null;
    },
  ) => Promise<boolean>;
  private _startAndroidDriverFn: (
    adbPath: string,
    deviceSerial: string,
    port: number,
  ) => AndroidDriverProcessHandle;
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
        getWaitStatusMessage?: () => string | null;
        getTimeoutMessage?: () => string | null;
      },
    ) => Promise<boolean>;
    startAndroidDriverFn: (
      adbPath: string,
      deviceSerial: string,
      port: number,
    ) => AndroidDriverProcessHandle;
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

    let driverInstalled = false;
    let testRunnerInstalled = false;
    let localPort: number | null = null;
    let driverProcess: AndroidDriverProcessHandle | null = null;
    let startupState: AndroidDriverStartupState | null = null;

    try {
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
      driverInstalled = true;

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
        testRunnerInstalled = true;
      } else {
        Logger.w('Test runner APK not found - instrumentation may fail');
      }

      await this._adbClient.removePortForward(adbPath, deviceSerial);
      localPort = await this._adbClient.forwardPort(
        adbPath,
        deviceSerial,
        DEFAULT_GRPC_PORT_START,
      );

      Logger.i('Starting Android driver instrumentation...');
      driverProcess = this._startAndroidDriverFn(adbPath, deviceSerial, localPort);
      const androidStartupState = this._trackAndroidDriverProcess(
        deviceSerial,
        driverProcess,
      );
      startupState = androidStartupState;

      Logger.i(`Waiting for Android driver gRPC at 127.0.0.1:${localPort}...`);
      const connected = await this._connectWithPolling(
        grpcClient,
        '127.0.0.1',
        localPort,
        {
          getStartupFailureMessage: () => androidStartupState.failureMessage,
          getWaitStatusMessage: () => this._formatWaitStatus(androidStartupState),
          getTimeoutMessage: () =>
            this._buildTimeoutMessage(deviceSerial, localPort!, androidStartupState),
        },
      );
      if (!connected) {
        throw new Error('Failed to connect to device via gRPC after 120s - driver did not start');
      }

      const captureReady = await waitForDriverCaptureReadiness(grpcClient, {
        timeoutMs: this._captureReadinessTimeoutMs,
        delayMs: this._captureReadinessDelayMs,
      });
      if (!captureReady.ready) {
        if (androidStartupState.failureMessage) {
          throw new Error(androidStartupState.failureMessage);
        }
        throw new Error(
          `Driver started and gRPC connected, but UiAutomation never became ready for screenshot capture after ${this._captureReadinessTimeoutMs / 1000}s: ${captureReady.message ?? 'unknown capture readiness error'}`,
        );
      }
      if (androidStartupState.failureMessage) {
        throw new Error(androidStartupState.failureMessage);
      }

      androidStartupState.setupComplete = true;
      Logger.i('gRPC connection established successfully');
      return { adbPath, deviceSerial };
    } catch (error) {
      await this._rollbackFailedSetup({
        adbPath,
        deviceSerial,
        localPort,
        driverProcess,
        driverInstalled,
        testRunnerInstalled,
      });
      throw error;
    }
  }

  private _trackAndroidDriverProcess(
    deviceSerial: string,
    driverProcess: AndroidDriverProcessHandle,
  ): AndroidDriverStartupState {
    const state: AndroidDriverStartupState = {
      setupComplete: false,
      failureMessage: null,
      recentLogs: [],
      processEnded: false,
      exitDescription: null,
      pid: driverProcess.pid,
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
        Logger.d(`Android driver ${source}: ${trimmed}`);
        state.recentLogs.push(`${source}: ${trimmed}`);
        if (state.recentLogs.length > 20) {
          state.recentLogs.shift();
        }
      }
    };

    driverProcess.stdout?.on('data', (chunk: Buffer | string) => appendLog('stdout', chunk));
    driverProcess.stderr?.on('data', (chunk: Buffer | string) => appendLog('stderr', chunk));

    driverProcess.on('error', (error: Error) => {
      state.processEnded = true;
      state.exitDescription = `error: ${error.message}`;
      state.failureMessage = `Android driver process error for ${deviceSerial}: ${error.message}`;
      Logger.e(state.failureMessage);
    });

    driverProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      state.processEnded = true;
      state.exitDescription =
        code !== null ? `code ${code}` : signal ? `signal ${signal}` : 'unknown status';
      const logSuffix =
        state.recentLogs.length > 0 ? ` Logs: ${state.recentLogs.join(' | ')}` : '';

      if (!state.setupComplete) {
        state.failureMessage =
          `Android driver process exited before setup completed (${state.exitDescription}) for ${deviceSerial}.${logSuffix}`;
        Logger.e(state.failureMessage);
      } else {
        Logger.i(
          `Android driver process ended for ${deviceSerial} (${state.exitDescription})`,
        );
      }
    });

    return state;
  }

  private _formatWaitStatus(state: AndroidDriverStartupState): string {
    const processState = state.processEnded
      ? `process exited (${state.exitDescription ?? 'unknown status'})`
      : `process alive${state.pid ? ` pid=${state.pid}` : ''}`;
    const lastLog = state.recentLogs.at(-1);
    return lastLog
      ? `${processState}; last log: ${lastLog}`
      : `${processState}; no driver output yet`;
  }

  private _buildTimeoutMessage(
    deviceSerial: string,
    localPort: number,
    state: AndroidDriverStartupState,
  ): string {
    const processState = state.processEnded
      ? `exited (${state.exitDescription ?? 'unknown status'})`
      : `alive${state.pid ? ` pid=${state.pid}` : ''}`;
    const logSummary =
      state.recentLogs.length > 0 ? state.recentLogs.join(' | ') : 'none';
    return (
      `Android device ${deviceSerial} was ready, but the driver never became reachable over ` +
      `gRPC at 127.0.0.1:${localPort} after 120s. Process state: ${processState}. ` +
      `Recent logs: ${logSummary}.`
    );
  }

  private async _rollbackFailedSetup(params: {
    adbPath: string;
    deviceSerial: string;
    localPort: number | null;
    driverProcess: AndroidDriverProcessHandle | null;
    driverInstalled: boolean;
    testRunnerInstalled: boolean;
  }): Promise<void> {
    if (params.driverProcess && !params.driverProcess.killed) {
      try {
        const killed = params.driverProcess.kill('SIGKILL');
        Logger.i(
          `Killed Android driver host process for ${params.deviceSerial}: ${killed}`,
        );
      } catch (error) {
        Logger.w(
          `Failed to kill Android driver host process for ${params.deviceSerial}:`,
          error,
        );
      }
    }

    if (params.localPort !== null) {
      try {
        await this._adbClient.removePortForward(params.adbPath, params.deviceSerial);
      } catch (error) {
        Logger.w(
          `Failed to remove Android port forward for ${params.deviceSerial}:`,
          error,
        );
      }
    }

    if (params.driverInstalled) {
      await this._adbClient.forceStop(
        params.adbPath,
        params.deviceSerial,
        ANDROID_DRIVER_APP_PACKAGE_NAME,
        { suppressErrorLog: true },
      );
    }
    if (params.testRunnerInstalled) {
      await this._adbClient.forceStop(
        params.adbPath,
        params.deviceSerial,
        ANDROID_DRIVER_TEST_PACKAGE_NAME,
        { suppressErrorLog: true },
      );
    }
  }
}
