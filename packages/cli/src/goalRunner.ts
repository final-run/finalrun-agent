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
  'init' | 'detectDevices' | 'setUpDevice' | 'cleanup' | 'deviceManager'
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

export interface GoalRunnerDependencies {
  createFilePathUtil(): CliFilePathUtil;
  getDeviceNode(): GoalRunnerDeviceNode;
  createAiAgent(params: ConstructorParameters<typeof AIAgent>[0]): AIAgent;
  createExecutor(
    params: ConstructorParameters<typeof HeadlessGoalExecutor>[0],
  ): GoalRunnerExecutor;
  createRenderer(): GoalRunnerRenderer;
}

export const goalRunnerDependencies: GoalRunnerDependencies = {
  createFilePathUtil: () => new CliFilePathUtil(),
  getDeviceNode: () => DeviceNode.getInstance(),
  createAiAgent: (params) => new AIAgent(params),
  createExecutor: (params) => new HeadlessGoalExecutor(params),
  createRenderer: () => new TerminalRenderer(),
};

/**
 * Top-level orchestrator for running a goal from the CLI.
 *
 * Dart equivalent: runGoal() in mobile_cli/lib/goal_runner.dart
 */
export async function runGoal(
  config: GoalRunnerConfig,
  dependencies: GoalRunnerDependencies = goalRunnerDependencies,
): Promise<GoalResult> {
  const renderer = dependencies.createRenderer();
  let deviceNode: GoalRunnerDeviceNode | undefined;
  let cancelHandler: (() => void) | undefined;
  let device: GoalRunnerDevice | undefined;
  let activeRecording:
    | {
        testRunId: string;
        testCaseId: string;
        startedAt: string;
      }
    | undefined;

  try {
    // -- 1. Set up file path utility --
    const filePathUtil = dependencies.createFilePathUtil();

    // -- 2. Detect devices --
    console.log('\n\x1b[1mFinalRun CLI\x1b[0m');
    console.log('─'.repeat(50));
    console.log(`Goal: ${config.goal}`);
    console.log(`Model: ${config.provider}/${config.modelName}`);
    console.log('─'.repeat(50) + '\n');

    Logger.i('Detecting connected devices...');
    const adbPath = await filePathUtil.getADBPath();
    deviceNode = dependencies.getDeviceNode();
    deviceNode.init(filePathUtil);

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
    Logger.i(
      `Using device: ${deviceInfo.name ?? deviceInfo.id} (${platform})`,
    );

    // -- 3. Set up device (install driver, connect gRPC) --
    Logger.i('Setting up device...');
    device = await deviceNode.setUpDevice(deviceInfo);

    if (config.appOverridePath) {
      Logger.i(`Installing app override: ${config.appOverridePath}`);
      if (platform === PLATFORM_ANDROID) {
        if (!deviceInfo.id) {
          throw new Error('Android device serial is required to install an app override.');
        }
        const installed = await deviceNode.deviceManager.installAndroidApp(
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
        const installed = await deviceNode.deviceManager.installIOSApp(
          deviceInfo.id,
          config.appOverridePath,
        );
        if (!installed) {
          throw new Error(`Failed to install iOS app override: ${config.appOverridePath}`);
        }
      }
    }

    // -- 4. Create AI agent --
    const aiAgent = dependencies.createAiAgent({
      provider: config.provider,
      modelName: config.modelName,
      apiKey: config.apiKey,
    });

    // -- 5. Create and run the goal executor --
    const executor = dependencies.createExecutor({
      goal: config.goal,
      platform,
      maxIterations: config.maxIterations,
      agent: device,
      aiAgent,
      runtimeBindings: config.runtimeBindings,
    });

    // Handle SIGINT (Ctrl+C) for graceful cancellation
    cancelHandler = () => {
      Logger.i('\nReceived SIGINT — cancelling...');
      executor.cancel();
    };
    process.on('SIGINT', cancelHandler);

    const recordingRequired = config.recording !== undefined && platform === PLATFORM_ANDROID;

    if (config.recording) {
      const recordingResponse = await device.startRecording(
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
            platform,
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
      const stopResponse = await device.stopRecording(
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
    if (activeRecording && device) {
      try {
        await device.abortRecording(activeRecording.testRunId, false);
      } catch (error) {
        Logger.w('Failed to abort active recording during cleanup:', error);
      }
    }
    if (deviceNode) {
      try {
        await deviceNode.cleanup();
      } catch (error) {
        Logger.w('Failed to clean up device resources:', error);
      }
    }
    renderer.destroy();
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
