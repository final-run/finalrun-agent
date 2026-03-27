import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  DeviceInfo,
  DeviceNodeResponse,
  Logger,
  PLATFORM_ANDROID,
  type DeviceInventoryDiagnostic,
  type DeviceInventoryEntry,
  type DeviceInventoryReport,
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

function createIOSDeviceInfo(): DeviceInfo {
  return new DeviceInfo({
    id: 'BOOTED-DEVICE-1',
    deviceUUID: 'BOOTED-DEVICE-1',
    isAndroid: false,
    sdkVersion: 17,
    name: 'iPhone 15 Pro',
  });
}

function createInventoryEntryFromDevice(deviceInfo: DeviceInfo): DeviceInventoryEntry {
  const platform = deviceInfo.isAndroid ? 'android' : 'ios';
  const targetKind = deviceInfo.isAndroid ? 'android-emulator' : 'ios-simulator';
  const state = deviceInfo.isAndroid ? 'connected' : 'booted';
  return {
    selectionId: `${platform}:${deviceInfo.id}`,
    platform,
    targetKind,
    state,
    stateDetail: null,
    runnable: true,
    startable: false,
    displayName: `${deviceInfo.name ?? deviceInfo.id} - ${deviceInfo.id}`,
    rawId: deviceInfo.id ?? deviceInfo.deviceUUID,
    modelName: deviceInfo.name,
    osVersionLabel: deviceInfo.isAndroid ? 'Android 14' : 'iOS 17.5',
    deviceInfo,
    transcripts: [],
  };
}

function createStartableIOSEntry(): DeviceInventoryEntry {
  return {
    selectionId: 'ios-simulator:SHUTDOWN-DEVICE-1',
    platform: 'ios',
    targetKind: 'ios-simulator',
    state: 'shutdown',
    stateDetail: null,
    runnable: false,
    startable: true,
    displayName: 'iPhone 15 - iOS 17.5 - SHUTDOWN-DEVICE-1',
    rawId: 'SHUTDOWN-DEVICE-1',
    modelName: 'iPhone 15',
    osVersionLabel: 'iOS 17.5',
    deviceInfo: null,
    transcripts: [],
  };
}

function createDependencies(params: {
  startRecording?: (request: RecordingRequest) => Promise<DeviceNodeResponse>;
  stopRecording?: (testRunId: string, testCaseId: string) => Promise<DeviceNodeResponse>;
  executeGoal?: () => Promise<GoalResult>;
  devices?: DeviceInfo[];
  inventoryReports?: DeviceInventoryReport[];
  adbPath?: string | null;
  onInit?: () => void;
  onDetectDevices?: () => void;
  onSetUpDevice?: () => void;
  onCleanup?: () => void | Promise<void>;
  onStartTarget?: (
    entry: DeviceInventoryEntry,
    adbPath: string | null,
  ) => DeviceInventoryDiagnostic | null | Promise<DeviceInventoryDiagnostic | null>;
  onInstallAndroidApp?: (adbPath: string, deviceId: string, appPath: string) => boolean | Promise<boolean>;
  onInstallIOSApp?: (deviceId: string, appPath: string) => boolean | Promise<boolean>;
  selectionInput?: string;
}): GoalRunnerDependencies {
  const printedResults: GoalResult[] = [];
  const selectionInput = new PassThrough();
  if (params.selectionInput) {
    selectionInput.end(params.selectionInput);
  }
  const selectionOutput = new PassThrough();
  let selectionOutputText = '';
  selectionOutput.on('data', (chunk: Buffer | string) => {
    selectionOutputText += String(chunk);
  });
  let inventoryCallCount = 0;
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
    async installAndroidApp(adbPath: string, deviceId: string, appPath: string) {
      return await (params.onInstallAndroidApp ??
        (async () => true))(adbPath, deviceId, appPath);
    },
    async installIOSApp(deviceId: string, appPath: string) {
      return await (params.onInstallIOSApp ?? (async () => true))(deviceId, appPath);
    },
    init() {
      params.onInit?.();
    },
    async detectInventory() {
      params.onDetectDevices?.();
      const defaultReport: DeviceInventoryReport = {
        entries: (params.devices ?? [createAndroidDeviceInfo()]).map(createInventoryEntryFromDevice),
        diagnostics: [],
      };
      const nextReport = params.inventoryReports?.[inventoryCallCount] ??
        params.inventoryReports?.[params.inventoryReports.length - 1] ??
        defaultReport;
      inventoryCallCount += 1;
      return nextReport;
    },
    async startTarget(entry: DeviceInventoryEntry, adbPath: string | null) {
      return await (params.onStartTarget ?? (async () => null))(entry, adbPath);
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
    createSelectionIO: () => ({
      input: selectionInput,
      output: selectionOutput,
      isTTY: true,
    }),
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
    __selectionOutputText: () => selectionOutputText,
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

test('prepareGoalSession logs a compact summary when one target is auto-selected', async () => {
  const androidEntry = createInventoryEntryFromDevice(createAndroidDeviceInfo());
  const shutdownEntry = createStartableIOSEntry();
  const dependencies = createDependencies({
    inventoryReports: [
      {
        entries: [androidEntry, shutdownEntry],
        diagnostics: [],
      },
    ],
  });
  const logMessages: string[] = [];
  const sink = (entry: { renderedMessage: string }) => {
    logMessages.push(entry.renderedMessage);
  };
  Logger.addSink(sink);

  const session = await prepareGoalSession({}, dependencies);

  try {
    const output = (dependencies as GoalRunnerDependencies & {
      __selectionOutputText: () => string;
    }).__selectionOutputText();
    assert.equal(output, '');
    assert.match(
      logMessages.join('\n'),
      /\[finalrun\] Detected 2 targets \(1 Android, 1 iOS\); 1 ready target: Android Emulator - emulator-5554/,
    );
  } finally {
    Logger.removeSink(sink);
    await session.cleanup();
  }
});

test('prepareGoalSession prompts for a device when multiple runnable targets are available', async () => {
  const androidEntry = createInventoryEntryFromDevice(createAndroidDeviceInfo());
  const iosEntry = createInventoryEntryFromDevice(createIOSDeviceInfo());
  const dependencies = createDependencies({
    inventoryReports: [
      {
        entries: [androidEntry, iosEntry],
        diagnostics: [],
      },
    ],
    selectionInput: '2\n',
  });

  const session = await prepareGoalSession({}, dependencies);

  try {
    assert.equal(session.platform, 'ios');
    const output = (dependencies as GoalRunnerDependencies & {
      __selectionOutputText: () => string;
    }).__selectionOutputText();
    assert.doesNotMatch(output, /Detected local targets/);
    assert.match(output, /Select a device/);
    assert.match(output, /Ready Targets/);
    assert.match(output, /\(connected\)/);
    assert.match(output, /\(booted\)/);
    assert.equal((output.match(/Ready Targets/g) ?? []).length, 1);
  } finally {
    await session.cleanup();
  }
});

test('prepareGoalSession starts a selected shutdown simulator before setup', async () => {
  const shutdownEntry = createStartableIOSEntry();
  const bootedEntry: DeviceInventoryEntry = {
    selectionId: 'ios-simulator:SHUTDOWN-DEVICE-1',
    platform: 'ios',
    targetKind: 'ios-simulator',
    state: 'booted',
    stateDetail: null,
    runnable: true,
    startable: false,
    displayName: 'iPhone 15 - iOS 17.5 - SHUTDOWN-DEVICE-1',
    rawId: 'SHUTDOWN-DEVICE-1',
    modelName: 'iPhone 15',
    osVersionLabel: 'iOS 17.5',
    deviceInfo: new DeviceInfo({
      id: 'SHUTDOWN-DEVICE-1',
      deviceUUID: 'SHUTDOWN-DEVICE-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15',
    }),
    transcripts: [],
  };
  let startedTargets = 0;
  const dependencies = createDependencies({
    inventoryReports: [
      {
        entries: [shutdownEntry],
        diagnostics: [],
      },
      {
        entries: [bootedEntry],
        diagnostics: [],
      },
    ],
    async onStartTarget() {
      startedTargets += 1;
      return null;
    },
  });

  const session = await prepareGoalSession({}, dependencies);

  try {
    assert.equal(session.platform, 'ios');
    assert.equal(startedTargets, 1);
  } finally {
    await session.cleanup();
  }
});

test('prepareGoalSession reports Android app override failure after driver connection', async () => {
  let cleanupCalls = 0;
  let setUpCalls = 0;
  const dependencies = createDependencies({
    onSetUpDevice() {
      setUpCalls += 1;
    },
    async onCleanup() {
      cleanupCalls += 1;
    },
    async onInstallAndroidApp() {
      return false;
    },
  });

  await assert.rejects(
    () =>
      prepareGoalSession(
        {
          platform: PLATFORM_ANDROID,
          appOverridePath: '/tmp/app.apk',
        },
        dependencies,
      ),
    /Failed to install Android app override after driver connection: \/tmp\/app\.apk/,
  );

  assert.equal(setUpCalls, 1);
  assert.equal(cleanupCalls, 1);
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
