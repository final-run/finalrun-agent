// Port of mobile_cli/lib/goal_runner.dart
// Orchestrates: detect device → set up → execute goal.

import {
  DeviceInfo,
  Logger,
  PLATFORM_ANDROID,
  type RuntimeBindings,
} from '@finalrun/common';
import { DeviceNode } from '@finalrun/device-node';
import { HeadlessGoalExecutor, AIAgent } from '@finalrun/goal-executor';
import type { GoalResult } from '@finalrun/goal-executor';
import { CliFilePathUtil } from './filePathUtil.js';
import { TerminalRenderer } from './terminalRenderer.js';

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
}

/**
 * Top-level orchestrator for running a goal from the CLI.
 *
 * Dart equivalent: runGoal() in mobile_cli/lib/goal_runner.dart
 */
export async function runGoal(config: GoalRunnerConfig): Promise<GoalResult> {
  const renderer = new TerminalRenderer();
  let deviceNode: DeviceNode | undefined;
  let cancelHandler: (() => void) | undefined;

  try {
    // -- 1. Set up file path utility --
    const filePathUtil = new CliFilePathUtil();

    // -- 2. Detect devices --
    console.log('\n\x1b[1mFinalRun CLI\x1b[0m');
    console.log('─'.repeat(50));
    console.log(`Goal: ${config.goal}`);
    console.log(`Model: ${config.provider}/${config.modelName}`);
    console.log('─'.repeat(50) + '\n');

    Logger.i('Detecting connected devices...');
    const adbPath = await filePathUtil.getADBPath();
    deviceNode = DeviceNode.getInstance();
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
    const device = await deviceNode.setUpDevice(deviceInfo);

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
    const aiAgent = new AIAgent({
      provider: config.provider,
      modelName: config.modelName,
      apiKey: config.apiKey,
    });

    // -- 5. Create and run the goal executor --
    const executor = new HeadlessGoalExecutor({
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

    // Execute!
    const result = await executor.executeGoal((event) => renderer.onProgress(event));
    // Print summary
    renderer.printSummary(result);

    return result;
  } finally {
    if (cancelHandler) {
      process.removeListener('SIGINT', cancelHandler);
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
