import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  DEFAULT_GRPC_PORT_START,
  DeviceInfo,
  Logger,
  type FilePathUtil,
} from '@finalrun/common';
import { waitForDriverCaptureReadiness } from '../../capture/ScreenshotCaptureCoordinator.js';
import {
  IOS_DRIVER_RUNNER_BUNDLE_ID,
  type IOSDriverProcessHandle,
  type SimctlClient,
} from '../../infra/ios/SimctlClient.js';
import type { GrpcDriverClient } from '../GrpcDriverClient.js';

const execFileAsync = promisify(execFile);

interface DriverStartupState {
  setupComplete: boolean;
  failureMessage: string | null;
  recentLogs: string[];
}

export class IOSSimulatorSetup {
  private _simctlClient: SimctlClient;
  private _filePathUtil: FilePathUtil;
  private _connectWithPolling: (
    grpcClient: GrpcDriverClient,
    host: string,
    port: number,
    options?: {
      getStartupFailureMessage?: () => string | null;
    },
  ) => Promise<boolean>;
  private _captureReadinessTimeoutMs: number;
  private _captureReadinessDelayMs: number;
  private _killStaleHostProcessesOnPortFn: (port: number) => Promise<void>;

  constructor(params: {
    simctlClient: SimctlClient;
    filePathUtil: FilePathUtil;
    connectWithPolling: (
      grpcClient: GrpcDriverClient,
      host: string,
      port: number,
      options?: {
        getStartupFailureMessage?: () => string | null;
      },
    ) => Promise<boolean>;
    captureReadinessTimeoutMs: number;
    captureReadinessDelayMs: number;
    killStaleHostProcessesOnPortFn?: (port: number) => Promise<void>;
  }) {
    this._simctlClient = params.simctlClient;
    this._filePathUtil = params.filePathUtil;
    this._connectWithPolling = params.connectWithPolling;
    this._captureReadinessTimeoutMs = params.captureReadinessTimeoutMs;
    this._captureReadinessDelayMs = params.captureReadinessDelayMs;
    this._killStaleHostProcessesOnPortFn =
      params.killStaleHostProcessesOnPortFn ??
      (async (port: number) => await this._killStaleHostProcessesOnPort(port));
  }

  async prepare(
    deviceInfo: DeviceInfo,
    grpcClient: GrpcDriverClient,
  ): Promise<{ deviceId: string }> {
    await this._filePathUtil.ensureIOSAppsAvailable();

    const deviceId = deviceInfo.id;
    if (!deviceId) {
      throw new Error('iOS simulator ID is required for driver setup.');
    }

    const driverPath = await this._filePathUtil.getIOSDriverAppPath();
    if (!driverPath) {
      throw new Error('iOS driver app not found.');
    }

    Logger.i(`Installing iOS driver app on ${deviceId}...`);
    const installed = await this._simctlClient.installApp(deviceId, driverPath);
    if (!installed) {
      throw new Error(`Failed to install iOS driver app: ${driverPath}`);
    }

    await this._killStaleHostProcessesOnPortFn(DEFAULT_GRPC_PORT_START);

    Logger.i(`Terminating existing iOS driver app on ${deviceId}...`);
    await this._simctlClient.terminateApp(deviceId, IOS_DRIVER_RUNNER_BUNDLE_ID);

    Logger.i('Starting iOS driver app...');
    const driverProcess = this._simctlClient.startDriver(
      deviceId,
      DEFAULT_GRPC_PORT_START,
    );
    const startupState = this._trackIOSDriverProcess(deviceId, driverProcess);

    Logger.i(
      `Connecting gRPC to iOS simulator at 127.0.0.1:${DEFAULT_GRPC_PORT_START}...`,
    );
    const connected = await this._connectWithPolling(
      grpcClient,
      '127.0.0.1',
      DEFAULT_GRPC_PORT_START,
      {
        getStartupFailureMessage: () => startupState.failureMessage,
      },
    );
    if (!connected) {
      throw new Error('Failed to connect to iOS simulator via gRPC after 120s - driver did not start');
    }

    const captureReady = await waitForDriverCaptureReadiness(grpcClient, {
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

    await this._updateIOSAppIds(deviceId, grpcClient, { throwOnFailure: true });

    startupState.setupComplete = true;
    Logger.i('iOS gRPC connection established successfully');
    return { deviceId };
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
    const appIds = await this._simctlClient.listInstalledAppIds(deviceId);
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
