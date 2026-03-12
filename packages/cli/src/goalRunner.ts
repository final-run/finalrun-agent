// Port of mobile_cli/lib/goal_runner.dart
// Orchestrates: detect device → set up → execute goal.

import { DeviceInfo, Logger } from '@finalrun/common';
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
}

/**
 * Top-level orchestrator for running a goal from the CLI.
 *
 * Dart equivalent: runGoal() in mobile_cli/lib/goal_runner.dart
 */
export async function runGoal(config: GoalRunnerConfig): Promise<GoalResult> {
  const renderer = new TerminalRenderer();

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
    const deviceNode = DeviceNode.getInstance();
    deviceNode.init(filePathUtil);

    const devices: DeviceInfo[] = await deviceNode.detectDevices(adbPath);
    if (devices.length === 0) {
      throw new Error(
        'No devices found. Connect an Android or iOS device and try again.',
      );
    }

    // Pick the first device
    const deviceInfo = devices[0];
    const platform = deviceInfo.isAndroid ? 'android' : 'ios';
    Logger.i(
      `Using device: ${deviceInfo.name ?? deviceInfo.id} (${platform})`,
    );

    // -- 3. Set up device (install driver, connect gRPC) --
    Logger.i('Setting up device...');
    const device = await deviceNode.setUpDevice(deviceInfo);

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
    });

    // Handle SIGINT (Ctrl+C) for graceful cancellation
    const cancelHandler = () => {
      Logger.i('\nReceived SIGINT — cancelling...');
      executor.cancel();
    };
    process.on('SIGINT', cancelHandler);

    // Execute!
    const result = await executor.executeGoal((event) => renderer.onProgress(event));

    // Remove SIGINT handler
    process.removeListener('SIGINT', cancelHandler);

    // Print summary
    renderer.printSummary(result);

    // -- 6. Cleanup --
    await deviceNode.cleanup();

    return result;
  } finally {
    renderer.destroy();
  }
}
