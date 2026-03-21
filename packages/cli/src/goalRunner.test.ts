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
  executeGoalOnSession,
  prepareGoalSession,
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
  startRecording?: (request: RecordingRequest) => Promise<DeviceNodeResponse>;
  stopRecording?: (testRunId: string, testCaseId: string) => Promise<DeviceNodeResponse>;
  executeGoal?: () => Promise<GoalResult>;
  devices?: DeviceInfo[];
  adbPath?: string | null;
  onInit?: () => void;
  onDetectDevices?: () => void;
  onSetUpDevice?: () => void;
  onCleanup?: () => void | Promise<void>;
  onInstallAndroidApp?: (adbPath: string, deviceId: string, appPath: string) => boolean | Promise<boolean>;
  onInstallIOSApp?: (deviceId: string, appPath: string) => boolean | Promise<boolean>;
}): GoalRunnerDependencies {
  const printedResults: GoalResult[] = [];
  const device = {
    async startRecording(request: RecordingRequest) {
      return await (params.startRecording ??
        (async () =>
          new DeviceNodeResponse({
            success: true,
            data: {
              startedAt: '2026-03-20T10:00:00.000Z',
            },
          })))(request);
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
      async installAndroidApp(adbPath: string, deviceId: string, appPath: string) {
        return await (params.onInstallAndroidApp ??
          (async () => true))(adbPath, deviceId, appPath);
      },
      async installIOSApp(deviceId: string, appPath: string) {
        return await (params.onInstallIOSApp ?? (async () => true))(deviceId, appPath);
      },
    },
    init() {
      params.onInit?.();
    },
    async detectDevices() {
      params.onDetectDevices?.();
      return params.devices ?? [createAndroidDeviceInfo()];
    },
    async setUpDevice() {
      params.onSetUpDevice?.();
      return device;
    },
    async cleanup() {
      await params.onCleanup?.();
    },
  };

  const dependencies: GoalRunnerDependencies = {
    createFilePathUtil: () =>
      ({
        async getADBPath() {
          return params.adbPath ?? '/usr/bin/adb';
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

test('prepareGoalSession installs the Android app override once during shared setup', async () => {
  const installCalls: Array<[string, string, string]> = [];
  let detectCalls = 0;
  let setUpCalls = 0;
  let cleanupCalls = 0;
  const dependencies = createDependencies({
    onDetectDevices() {
      detectCalls += 1;
    },
    onSetUpDevice() {
      setUpCalls += 1;
    },
    async onCleanup() {
      cleanupCalls += 1;
    },
    async onInstallAndroidApp(adbPath, deviceId, appPath) {
      installCalls.push([adbPath, deviceId, appPath]);
      return true;
    },
  });

  const session = await prepareGoalSession(
    {
      platform: PLATFORM_ANDROID,
      appOverridePath: '/tmp/app.apk',
    },
    dependencies,
  );

  try {
    assert.equal(session.platform, PLATFORM_ANDROID);
    assert.equal(detectCalls, 1);
    assert.equal(setUpCalls, 1);
    assert.deepEqual(installCalls, [['/usr/bin/adb', 'emulator-5554', '/tmp/app.apk']]);
  } finally {
    await session.cleanup();
    assert.equal(cleanupCalls, 1);
  }
});

test('executeGoalOnSession reuses one prepared session while keeping recording scoped per spec', async () => {
  const recordingRequests: RecordingRequest[] = [];
  const stopCalls: Array<[string, string]> = [];
  let detectCalls = 0;
  let setUpCalls = 0;
  let cleanupCalls = 0;
  const dependencies = createDependencies({
    onDetectDevices() {
      detectCalls += 1;
    },
    onSetUpDevice() {
      setUpCalls += 1;
    },
    async onCleanup() {
      cleanupCalls += 1;
    },
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
          filePath: `/tmp/${testCaseId}.mp4`,
          startedAt: '2026-03-20T10:00:00.000Z',
          completedAt: '2026-03-20T10:00:05.000Z',
        },
      });
    },
  });

  const session = await prepareGoalSession(
    {
      platform: PLATFORM_ANDROID,
    },
    dependencies,
  );

  try {
    await executeGoalOnSession(
      session,
      {
        goal: 'Spec 1',
        apiKey: 'test-key',
        provider: 'openai',
        modelName: 'gpt-4.1',
        recording: {
          testRunId: 'run-1',
          testCaseId: 'case-1',
        },
      },
      dependencies,
    );
    await executeGoalOnSession(
      session,
      {
        goal: 'Spec 2',
        apiKey: 'test-key',
        provider: 'openai',
        modelName: 'gpt-4.1',
        recording: {
          testRunId: 'run-1',
          testCaseId: 'case-2',
        },
      },
      dependencies,
    );

    assert.equal(detectCalls, 1);
    assert.equal(setUpCalls, 1);
    assert.deepEqual(
      recordingRequests.map((request) => request.testCaseId),
      ['case-1', 'case-2'],
    );
    assert.deepEqual(stopCalls, [
      ['run-1', 'case-1'],
      ['run-1', 'case-2'],
    ]);
  } finally {
    await session.cleanup();
    assert.equal(cleanupCalls, 1);
  }
});

test('runGoal still performs isolated setup and cleanup for single-spec execution', async () => {
  let detectCalls = 0;
  let setUpCalls = 0;
  let cleanupCalls = 0;
  const dependencies = createDependencies({
    onDetectDevices() {
      detectCalls += 1;
    },
    onSetUpDevice() {
      setUpCalls += 1;
    },
    async onCleanup() {
      cleanupCalls += 1;
    },
  });

  const result = await runGoal(
    {
      goal: 'Log in',
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4.1',
      platform: PLATFORM_ANDROID,
    },
    dependencies,
  );

  assert.equal(result.success, true);
  assert.equal(detectCalls, 1);
  assert.equal(setUpCalls, 1);
  assert.equal(cleanupCalls, 1);
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
