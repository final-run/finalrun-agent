// Port of mobile_cli/lib/goal_runner.dart
// Orchestrates: detect device → set up → execute goal.

import {
  DeviceInfo,
  Logger,
  PLATFORM_ANDROID,
  RecordingRequest,
  type RuntimeBindings,
} from '@finalrun/common';
import { DeviceNode } from '@finalrun/device-node';
import {
  HeadlessGoalExecutor,
  AIAgent,
  type GoalRecordingResult,
} from '@finalrun/goal-executor';
import type { GoalResult } from '@finalrun/goal-executor';
import { CliFilePathUtil } from './filePathUtil.js';
import { TerminalRenderer } from './terminalRenderer.js';

type GoalRunnerDeviceNode = Pick<
  DeviceNode,
  'init' | 'detectDevices' | 'setUpDevice' | 'cleanup' | 'installAndroidApp' | 'installIOSApp'
>;

type GoalRunnerDevice = Awaited<ReturnType<DeviceNode['setUpDevice']>>;

type GoalRunnerRenderer = Pick<
  TerminalRenderer,
  'onProgress' | 'printSummary' | 'destroy'
>;

type GoalRunnerExecutor = Pick<
  HeadlessGoalExecutor,
  'cancel' | 'executeGoal'
>;

export interface GoalRunnerConfig {
  goal: string;
  apiKey: string;
  provider: string;   // 'openai' | 'google' | 'anthropic'
  modelName: string;  // e.g., 'gpt-4o', 'gemini-2.0-flash'
  maxIterations?: number;
  debug?: boolean;
  platform?: string;
  appOverridePath?: string;
  runtimeBindings?: RuntimeBindings;
  recording?: {
    testRunId: string;
    testCaseId: string;
  };
}

export interface GoalSessionConfig {
  platform?: string;
  appOverridePath?: string;
}

export interface GoalRunnerDependencies {
  createFilePathUtil(): CliFilePathUtil;
  getDeviceNode(): GoalRunnerDeviceNode;
  createAiAgent(params: ConstructorParameters<typeof AIAgent>[0]): AIAgent;
  createExecutor(
    params: ConstructorParameters<typeof HeadlessGoalExecutor>[0],
  ): GoalRunnerExecutor;
  createRenderer(): GoalRunnerRenderer;
}

export interface GoalSession {
  deviceNode: GoalRunnerDeviceNode;
  device: GoalRunnerDevice;
  deviceInfo: DeviceInfo;
  platform: string;
  cleanup(): Promise<void>;
}

export const goalRunnerDependencies: GoalRunnerDependencies = {
  createFilePathUtil: () => new CliFilePathUtil(),
  getDeviceNode: () => DeviceNode.getInstance(),
  createAiAgent: (params) => new AIAgent(params),
  createExecutor: (params) => new HeadlessGoalExecutor(params),
  createRenderer: () => new TerminalRenderer(),
};

export async function prepareGoalSession(
  config: GoalSessionConfig,
  dependencies: GoalRunnerDependencies = goalRunnerDependencies,
): Promise<GoalSession> {
  const filePathUtil = dependencies.createFilePathUtil();
  Logger.i('Detecting connected devices...');
  const adbPath = await filePathUtil.getADBPath();
  const deviceNode = dependencies.getDeviceNode();
  deviceNode.init(filePathUtil);
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    await deviceNode.cleanup();
  };

  try {
    const devices: DeviceInfo[] = await deviceNode.detectDevices(adbPath);
    if (devices.length === 0) {
      throw new Error(
        'No devices found. Connect an Android or iOS device and try again.',
      );
    }

    const selectedPlatform = selectPlatform(devices, config.platform);
    const deviceInfo = devices.find((candidate) => candidate.getPlatform() === selectedPlatform);
    if (!deviceInfo) {
      throw new Error(`No ${selectedPlatform} device found.`);
    }

    const platform = deviceInfo.isAndroid ? PLATFORM_ANDROID : 'ios';
    Logger.i(`Using device: ${deviceInfo.name ?? deviceInfo.id} (${platform})`);

    Logger.i('Setting up device...');
    const device = await deviceNode.setUpDevice(deviceInfo);

    if (config.appOverridePath) {
      Logger.i(`Installing app override: ${config.appOverridePath}`);
      if (platform === PLATFORM_ANDROID) {
        if (!deviceInfo.id) {
          throw new Error('Android device serial is required to install an app override.');
        }
        const installed = await deviceNode.installAndroidApp(
          adbPath!,
          deviceInfo.id,
          config.appOverridePath,
        );
        if (!installed) {
          throw new Error(`Failed to install Android app override: ${config.appOverridePath}`);
        }
      } else {
        if (!deviceInfo.id) {
          throw new Error('iOS simulator ID is required to install an app override.');
        }
        const installed = await deviceNode.installIOSApp(
          deviceInfo.id,
          config.appOverridePath,
        );
        if (!installed) {
          throw new Error(`Failed to install iOS app override: ${config.appOverridePath}`);
        }
      }
    }

    return {
      deviceNode,
      device,
      deviceInfo,
      platform,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      Logger.w('Failed to clean up device resources after setup failure:', cleanupError);
    }
    throw error;
  }
}

export async function executeGoalOnSession(
  session: GoalSession,
  config: GoalRunnerConfig,
  dependencies: GoalRunnerDependencies = goalRunnerDependencies,
): Promise<GoalResult> {
  const renderer = dependencies.createRenderer();
  let cancelHandler: (() => void) | undefined;
  let activeRecording:
    | {
        testRunId: string;
        testCaseId: string;
        startedAt: string;
      }
    | undefined;

  try {
    const aiAgent = dependencies.createAiAgent({
      provider: config.provider,
      modelName: config.modelName,
      apiKey: config.apiKey,
    });

    const executor = dependencies.createExecutor({
      goal: config.goal,
      platform: session.platform,
      maxIterations: config.maxIterations,
      agent: session.device,
      aiAgent,
      runtimeBindings: config.runtimeBindings,
    });

    // Handle SIGINT (Ctrl+C) for graceful cancellation
    cancelHandler = () => {
      Logger.i('\nReceived SIGINT — cancelling...');
      executor.cancel();
    };
    process.on('SIGINT', cancelHandler);

    const recordingRequired =
      config.recording !== undefined && session.platform === PLATFORM_ANDROID;

    if (config.recording) {
      const recordingResponse = await session.device.startRecording(
        new RecordingRequest({
          testRunId: config.recording.testRunId,
          testCaseId: config.recording.testCaseId,
          apiKey: config.apiKey,
        }),
      );

      if (recordingResponse.success) {
        activeRecording = {
          testRunId: config.recording.testRunId,
          testCaseId: config.recording.testCaseId,
          startedAt:
            typeof recordingResponse.data?.['startedAt'] === 'string'
              ? (recordingResponse.data['startedAt'] as string)
              : new Date().toISOString(),
        };
        Logger.i(
          `Recording started for spec ${config.recording.testCaseId} at ${activeRecording.startedAt}`,
        );
      } else {
        const message =
          `Unable to start recording for spec ${config.recording.testCaseId}: ` +
          `${recordingResponse.message ?? 'unknown recording error'}`;
        if (recordingRequired) {
          Logger.e(message);
          const failureResult = createRecordingFailureResult({
            platform: session.platform,
            message: `Recording is required for Android runs. ${message}`,
          });
          renderer.printSummary(failureResult);
          return failureResult;
        }
        Logger.w(message);
      }
    }

    // Execute!
    let result = await executor.executeGoal((event) => renderer.onProgress(event));

    let recording: GoalRecordingResult | undefined;
    if (activeRecording) {
      const stopResponse = await session.device.stopRecording(
        activeRecording.testRunId,
        activeRecording.testCaseId,
      );
      if (stopResponse.success) {
        const filePath = stopResponse.data?.['filePath'];
        if (typeof filePath === 'string') {
          recording = {
            filePath,
            startedAt:
              typeof stopResponse.data?.['startedAt'] === 'string'
                ? (stopResponse.data['startedAt'] as string)
                : activeRecording.startedAt,
            completedAt:
              typeof stopResponse.data?.['completedAt'] === 'string'
                ? (stopResponse.data['completedAt'] as string)
                : new Date().toISOString(),
          };
        } else if (recordingRequired) {
          const message =
            `Recording is required for Android runs. ` +
            `Recording stopped for spec ${activeRecording.testCaseId} but no file path was returned.`;
          Logger.e(message);
          result = markGoalResultFailed(result, message);
        } else {
          Logger.w(
            `Recording stopped for spec ${activeRecording.testCaseId} but no file path was returned.`,
          );
        }
      } else {
        const message =
          `Unable to stop recording for spec ${activeRecording.testCaseId}: ` +
          `${stopResponse.message ?? 'unknown recording error'}`;
        if (recordingRequired) {
          Logger.e(message);
          result = markGoalResultFailed(
            result,
            `Recording is required for Android runs. ${message}`,
          );
        } else {
          Logger.w(message);
        }
      }
      activeRecording = undefined;
    }

    const finalResult = recording ? { ...result, recording } : result;
    // Print summary
    renderer.printSummary(finalResult);

    return finalResult;
  } finally {
    if (cancelHandler) {
      process.removeListener('SIGINT', cancelHandler);
    }
    if (activeRecording) {
      try {
        await session.device.abortRecording(activeRecording.testRunId, false);
      } catch (error) {
        Logger.w('Failed to abort active recording during cleanup:', error);
      }
    }
    renderer.destroy();
  }
}

/**
 * Top-level orchestrator for running a goal from the CLI.
 *
 * Dart equivalent: runGoal() in mobile_cli/lib/goal_runner.dart
 */
export async function runGoal(
  config: GoalRunnerConfig,
  dependencies: GoalRunnerDependencies = goalRunnerDependencies,
): Promise<GoalResult> {
  printRunBanner(config);
  const session = await prepareGoalSession(
    {
      platform: config.platform,
      appOverridePath: config.appOverridePath,
    },
    dependencies,
  );

  try {
    return await executeGoalOnSession(session, config, dependencies);
  } finally {
    try {
      await session.cleanup();
    } catch (error) {
      Logger.w('Failed to clean up device resources:', error);
    }
  }
}

function createRecordingFailureResult(params: {
  platform: string;
  message: string;
}): GoalResult {
  const timestamp = new Date().toISOString();
  return {
    success: false,
    message: params.message,
    platform: params.platform,
    startedAt: timestamp,
    completedAt: timestamp,
    steps: [],
    totalIterations: 0,
  };
}

function markGoalResultFailed(result: GoalResult, message: string): GoalResult {
  return {
    ...result,
    success: false,
    message: result.success ? message : `${result.message}\n${message}`,
  };
}

function printRunBanner(config: GoalRunnerConfig): void {
  console.log('\n\x1b[1mFinalRun CLI\x1b[0m');
  console.log('─'.repeat(50));
  console.log(`Goal: ${config.goal}`);
  console.log(`Model: ${config.provider}/${config.modelName}`);
  console.log('─'.repeat(50) + '\n');
}

function selectPlatform(
  devices: DeviceInfo[],
  requestedPlatform?: string,
): string {
  if (requestedPlatform) {
    const normalizedPlatform = requestedPlatform.toLowerCase();
    const hasPlatform = devices.some((device) => device.getPlatform() === normalizedPlatform);
    if (!hasPlatform) {
      throw new Error(`No ${normalizedPlatform} devices found.`);
    }
    return normalizedPlatform;
  }

  const platforms = new Set(devices.map((device) => device.getPlatform()));
  if (platforms.size > 1) {
    throw new Error(
      'Multiple platforms are available. Choose --platform android or --platform ios.',
    );
  }

  return devices[0]!.getPlatform();
}
