import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeviceInfo,
  DeviceNodeResponse,
  PLATFORM_ANDROID,
  type RecordingRequest,
} from '@finalrun/common';
import type { GoalResult } from '@finalrun/goal-executor';
import type { DeviceNode } from '@finalrun/device-node';
import {
  runGoal,
  type GoalRunnerDependencies,
} from './goalRunner.js';

function createAndroidGoalResult(): GoalResult {
  return {
    success: true,
    message: 'Goal completed successfully.',
    platform: PLATFORM_ANDROID,
    startedAt: '2026-03-20T10:00:00.000Z',
    completedAt: '2026-03-20T10:00:05.000Z',
    steps: [],
    totalIterations: 1,
  };
}

function createAndroidDeviceInfo(): DeviceInfo {
  return new DeviceInfo({
    id: 'emulator-5554',
    deviceUUID: 'emulator-5554',
    isAndroid: true,
    sdkVersion: 34,
    name: 'Android Emulator',
  });
}

function createDependencies(params: {
  startRecording: (request: RecordingRequest) => Promise<DeviceNodeResponse>;
  stopRecording?: (testRunId: string, testCaseId: string) => Promise<DeviceNodeResponse>;
  executeGoal?: () => Promise<GoalResult>;
}): GoalRunnerDependencies {
  const printedResults: GoalResult[] = [];
  const device = {
    async startRecording(request: RecordingRequest) {
      return await params.startRecording(request);
    },
    async stopRecording(testRunId: string, testCaseId: string) {
      return await (params.stopRecording ??
        (async () =>
          new DeviceNodeResponse({
            success: true,
            data: {
              filePath: '/tmp/run_case.mp4',
              startedAt: '2026-03-20T10:00:00.000Z',
              completedAt: '2026-03-20T10:00:05.000Z',
            },
          })))(testRunId, testCaseId);
    },
    async abortRecording() {},
  };

  const deviceNode = {
    deviceManager: {
      async installAndroidApp() {
        return true;
      },
      async installIOSApp() {
        return true;
      },
    },
    init() {},
    async detectDevices() {
      return [createAndroidDeviceInfo()];
    },
    async setUpDevice() {
      return device;
    },
    async cleanup() {},
  };

  const dependencies: GoalRunnerDependencies = {
    createFilePathUtil: () =>
      ({
        async getADBPath() {
          return '/usr/bin/adb';
        },
      }) as unknown as ReturnType<GoalRunnerDependencies['createFilePathUtil']>,
    getDeviceNode: () => deviceNode as unknown as DeviceNode,
    createAiAgent: () => ({}) as never,
    createExecutor: () =>
      ({
        cancel() {},
        async executeGoal() {
          return await (params.executeGoal ?? (async () => createAndroidGoalResult()))();
        },
      }) as ReturnType<GoalRunnerDependencies['createExecutor']>,
    createRenderer: () => ({
      onProgress() {},
      printSummary(result: GoalResult) {
        printedResults.push(result);
      },
      destroy() {},
    }),
  };

  Object.assign(dependencies, {
    __printedResults: printedResults,
  });

  return dependencies;
}

test('runGoal starts and stops Android recording when recording is configured', async () => {
  const recordingRequests: RecordingRequest[] = [];
  const stopCalls: Array<[string, string]> = [];
  const dependencies = createDependencies({
    async startRecording(request) {
      recordingRequests.push(request);
      return new DeviceNodeResponse({
        success: true,
        data: {
          startedAt: '2026-03-20T10:00:00.000Z',
        },
      });
    },
    async stopRecording(testRunId, testCaseId) {
      stopCalls.push([testRunId, testCaseId]);
      return new DeviceNodeResponse({
        success: true,
        data: {
          filePath: '/tmp/run_case.mp4',
          startedAt: '2026-03-20T10:00:00.000Z',
          completedAt: '2026-03-20T10:00:05.000Z',
        },
      });
    },
  });

  const result = await runGoal(
    {
      goal: 'Log in',
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4.1',
      platform: PLATFORM_ANDROID,
      recording: {
        testRunId: 'run-1',
        testCaseId: 'case-1',
      },
    },
    dependencies,
  );

  assert.equal(result.success, true);
  assert.deepEqual(stopCalls, [['run-1', 'case-1']]);
  assert.equal(recordingRequests.length, 1);
  assert.equal(recordingRequests[0]?.testRunId, 'run-1');
  assert.equal(recordingRequests[0]?.testCaseId, 'case-1');
  assert.equal(result.recording?.filePath, '/tmp/run_case.mp4');
});

test('runGoal fails before execution if required Android recording cannot start', async () => {
  let executed = false;
  const dependencies = createDependencies({
    async startRecording() {
      return new DeviceNodeResponse({
        success: false,
        message: 'scrcpy not found in PATH',
      });
    },
    async executeGoal() {
      executed = true;
      return createAndroidGoalResult();
    },
  });

  const result = await runGoal(
    {
      goal: 'Log in',
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4.1',
      platform: PLATFORM_ANDROID,
      recording: {
        testRunId: 'run-1',
        testCaseId: 'case-1',
      },
    },
    dependencies,
  );

  assert.equal(result.success, false);
  assert.equal(executed, false);
  assert.match(result.message, /Recording is required for Android runs/);
});

test('runGoal marks the Android spec as failed if recording stops without a video file', async () => {
  const dependencies = createDependencies({
    async startRecording() {
      return new DeviceNodeResponse({
        success: true,
        data: {
          startedAt: '2026-03-20T10:00:00.000Z',
        },
      });
    },
    async stopRecording() {
      return new DeviceNodeResponse({
        success: false,
        message: 'scrcpy process exited before file creation',
      });
    },
  });

  const result = await runGoal(
    {
      goal: 'Log in',
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4.1',
      platform: PLATFORM_ANDROID,
      recording: {
        testRunId: 'run-1',
        testCaseId: 'case-1',
      },
    },
    dependencies,
  );

  assert.equal(result.success, false);
  assert.match(result.message, /Recording is required for Android runs/);
});
