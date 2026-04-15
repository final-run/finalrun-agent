import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'child_process';
import {
  DeviceNodeResponse,
  PLATFORM_ANDROID,
  PLATFORM_IOS,
  RecordingRequest,
} from '@finalrun/common';
import { RecordingManager } from './RecordingManager.js';
import type { RecordingProvider } from './RecordingProvider.js';

class FakeChildProcess extends EventEmitter {
  pid: number | undefined = 1234;
  exitCode: number | null = null;
  kill(): boolean {
    return true;
  }
}

test('RecordingManager creates sanitized iOS output paths and stops using the same file', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-recording-manager-'));
  const process = new FakeChildProcess();
  let startedFilePath = '';
  let stoppedFilePath = '';

  const provider: RecordingProvider = {
    recordingFolder: 'fr_ios_screen_recording',
    platformName: PLATFORM_IOS,
    fileExtension: 'mov',
    async startRecordingProcess(params) {
      startedFilePath = params.filePath;
      return {
        process: process as unknown as ChildProcess,
        response: new DeviceNodeResponse({ success: true }),
      };
    },
    async stopRecordingProcess(params) {
      stoppedFilePath = params.filePath;
      return new DeviceNodeResponse({ success: true });
    },
    async checkAvailability() {
      return new DeviceNodeResponse({ success: true });
    },
    async cleanupPlatformResources() {},
  };

  const manager = new RecordingManager({
    providers: { [PLATFORM_IOS]: provider },
    cwdProvider: () => tempDir,
  });

  const startResponse = await manager.startRecording({
    deviceId: 'SIM-1',
    platform: PLATFORM_IOS,
    sdkVersion: '17',
    recordingRequest: new RecordingRequest({
      runId: 'run 1',
      testId: 'case/name',
      apiKey: 'key',
    }),
  });

  assert.equal(startResponse.success, true);
  assert.equal(
    startedFilePath,
    path.join(tempDir, 'fr_ios_screen_recording', 'run_1_case_name.mov'),
  );

  await writeFile(startedFilePath, 'recording');
  const stopResponse = await manager.stopRecording('run 1', 'case/name', {
    platform: PLATFORM_IOS,
    keepOutput: false,
  });

  assert.equal(stopResponse.success, true);
  assert.equal(stoppedFilePath, startedFilePath);
  await assert.rejects(() => readFile(startedFilePath));
});

test('RecordingManager creates sanitized Android output paths and stops using the same mp4 file', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-recording-manager-'));
  const process = new FakeChildProcess();
  let startedFilePath = '';
  let stoppedFilePath = '';

  const provider: RecordingProvider = {
    recordingFolder: 'fr_android_screen_recording',
    platformName: PLATFORM_ANDROID,
    fileExtension: 'mp4',
    async startRecordingProcess(params) {
      startedFilePath = params.filePath;
      return {
        process: process as unknown as ChildProcess,
        response: new DeviceNodeResponse({ success: true }),
      };
    },
    async stopRecordingProcess(params) {
      stoppedFilePath = params.filePath;
      return new DeviceNodeResponse({ success: true });
    },
    async checkAvailability() {
      return new DeviceNodeResponse({ success: true });
    },
    async cleanupPlatformResources() {},
  };

  const manager = new RecordingManager({
    providers: { [PLATFORM_ANDROID]: provider },
    cwdProvider: () => tempDir,
  });

  const startResponse = await manager.startRecording({
    deviceId: 'emulator-5554',
    platform: PLATFORM_ANDROID,
    sdkVersion: '34',
    recordingRequest: new RecordingRequest({
      runId: 'run 1',
      testId: 'case/name',
      apiKey: 'key',
    }),
  });

  assert.equal(startResponse.success, true);
  assert.equal(
    startedFilePath,
    path.join(tempDir, 'fr_android_screen_recording', 'run_1_case_name.mp4'),
  );

  await writeFile(startedFilePath, 'recording');
  const stopResponse = await manager.stopRecording('run 1', 'case/name', {
    platform: PLATFORM_ANDROID,
    keepOutput: false,
  });

  assert.equal(stopResponse.success, true);
  assert.equal(stoppedFilePath, startedFilePath);
  await assert.rejects(() => readFile(startedFilePath));
});

test('RecordingManager uses an explicit output path instead of the legacy platform folder', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-recording-manager-'));
  const process = new FakeChildProcess();
  let startedFilePath = '';

  const provider: RecordingProvider = {
    recordingFolder: 'fr_android_screen_recording',
    platformName: PLATFORM_ANDROID,
    fileExtension: 'mp4',
    async startRecordingProcess(params) {
      startedFilePath = params.filePath;
      return {
        process: process as unknown as ChildProcess,
        response: new DeviceNodeResponse({ success: true }),
      };
    },
    async stopRecordingProcess() {
      return new DeviceNodeResponse({ success: true });
    },
    async checkAvailability() {
      return new DeviceNodeResponse({ success: true });
    },
    async cleanupPlatformResources() {},
  };

  const manager = new RecordingManager({
    providers: { [PLATFORM_ANDROID]: provider },
    cwdProvider: () => tempDir,
  });
  const explicitOutputPath = path.join(
    tempDir,
    'artifacts',
    'run-1',
    'tests',
    'case-name',
    'recording.mp4',
  );

  const startResponse = await manager.startRecording({
    deviceId: 'emulator-5554',
    platform: PLATFORM_ANDROID,
    sdkVersion: '34',
    recordingRequest: new RecordingRequest({
      runId: 'run 1',
      testId: 'case/name',
      apiKey: 'key',
      outputFilePath: explicitOutputPath,
    }),
  });

  assert.equal(startResponse.success, true);
  assert.equal(startedFilePath, explicitOutputPath);
});

test('RecordingManager preserves failed-stop output files when the process has already exited', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-recording-manager-'));
  const process = new FakeChildProcess();
  process.exitCode = 0;
  const outputPath = path.join(tempDir, 'artifacts', 'run-1', 'tests', 'case-1', 'recording.mp4');

  const provider: RecordingProvider = {
    recordingFolder: 'fr_android_screen_recording',
    platformName: PLATFORM_ANDROID,
    fileExtension: 'mp4',
    async startRecordingProcess() {
      return {
        process: process as unknown as ChildProcess,
        response: new DeviceNodeResponse({ success: true }),
      };
    },
    async stopRecordingProcess() {
      return new DeviceNodeResponse({
        success: false,
        message: 'recording file is incomplete',
      });
    },
    async checkAvailability() {
      return new DeviceNodeResponse({ success: true });
    },
    async cleanupPlatformResources() {},
  };

  const manager = new RecordingManager({
    providers: { [PLATFORM_ANDROID]: provider },
    cwdProvider: () => tempDir,
  });

  const startResponse = await manager.startRecording({
    deviceId: 'emulator-5554',
    platform: PLATFORM_ANDROID,
    sdkVersion: '34',
    recordingRequest: new RecordingRequest({
      runId: 'run-1',
      testId: 'case-1',
      apiKey: 'key',
      outputFilePath: outputPath,
    }),
  });

  assert.equal(startResponse.success, true);
  await writeFile(outputPath, 'partial recording');

  const stopResponse = await manager.stopRecording('run-1', 'case-1', {
    platform: PLATFORM_ANDROID,
    keepOutput: true,
  });
  assert.equal(stopResponse.success, false);

  await manager.cleanupDevice('emulator-5554', {
    platform: PLATFORM_ANDROID,
    keepOutput: false,
  });

  assert.equal(await readFile(outputPath, 'utf-8'), 'partial recording');
});

test('RecordingManager reports unsupported platforms when no provider is configured', async () => {
  const manager = new RecordingManager({
    providers: {},
  });

  const response = await manager.startRecording({
    deviceId: 'emulator-5554',
    platform: PLATFORM_ANDROID,
    recordingRequest: new RecordingRequest({
      runId: 'run',
      testId: 'case',
      apiKey: 'key',
    }),
  });

  assert.equal(response.success, false);
  assert.equal(
    response.message,
    'Screen recording is not configured for platform: android',
  );
});

// ============================================================================
// T027: Multi-device parallel-recording key-scoping regression.
// ============================================================================
//
// The multi-device orchestrator calls `startRecording()` with
// `useDeviceScopedKey: true` for distinct deviceIds on the same (runId, testId)
// pair (Alice + Bob). Before T004 this would collide on the 2-arg map key and
// return `Recording already in progress`. After T004 the 3-arg key must
// produce two distinct in-flight recordings that can both stop independently.

test('getMapKey: 2-arg call returns byte-identical single-device key', () => {
  const manager = new RecordingManager({ providers: {} });
  const key = manager.getMapKey('run-123', 'test-abc');
  assert.equal(key, 'run-123###test-abc');
});

test('getMapKey: 3-arg call appends sanitized deviceId suffix', () => {
  const manager = new RecordingManager({ providers: {} });
  const aliceKey = manager.getMapKey('run-123', 'test-abc', 'alice');
  const bobKey = manager.getMapKey('run-123', 'test-abc', 'bob');
  assert.equal(aliceKey, 'run-123###test-abc###alice');
  assert.equal(bobKey, 'run-123###test-abc###bob');
  assert.notEqual(aliceKey, bobKey);
});

test('getMapKey: 3-arg and 2-arg call produce different keys for same run/test', () => {
  const manager = new RecordingManager({ providers: {} });
  const twoArg = manager.getMapKey('run-123', 'test-abc');
  const threeArg = manager.getMapKey('run-123', 'test-abc', 'alice');
  assert.notEqual(twoArg, threeArg);
});

test('getMapKey: 3-arg call sanitizes deviceId characters', () => {
  const manager = new RecordingManager({ providers: {} });
  // `_sanitizeForFilename` strips / and : and spaces. Either of these would
  // corrupt the `###` delimiter.
  const key = manager.getMapKey('run-1', 'test-1', 'emulator-5554 (arm64)');
  assert.match(key, /^run-1###test-1###emulator-5554/);
  assert.ok(!key.includes(' '));
});

test('RecordingManager startRecording: parallel Alice+Bob on same (runId,testId) do not collide', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-recording-parallel-'));
  const started = new Map<string, string>();
  const stopped = new Map<string, string>();
  const provider: RecordingProvider = {
    recordingFolder: 'fr_android_screen_recording',
    platformName: PLATFORM_ANDROID,
    fileExtension: 'mp4',
    async startRecordingProcess(params) {
      started.set(params.filePath, params.filePath);
      return {
        process: new FakeChildProcess() as unknown as ChildProcess,
        response: new DeviceNodeResponse({ success: true }),
      };
    },
    async stopRecordingProcess(params) {
      stopped.set(params.filePath, params.filePath);
      return new DeviceNodeResponse({ success: true });
    },
    async checkAvailability() {
      return new DeviceNodeResponse({ success: true });
    },
    async cleanupPlatformResources() {},
  };

  const manager = new RecordingManager({
    providers: { [PLATFORM_ANDROID]: provider },
    cwdProvider: () => tempDir,
  });

  const commonRecording = () => ({
    runId: 'run-42',
    testId: 'chat__send_message',
    apiKey: 'key',
  });

  const [aliceResult, bobResult] = await Promise.all([
    manager.startRecording({
      deviceId: 'emulator-5554',
      platform: PLATFORM_ANDROID,
      useDeviceScopedKey: true,
      recordingRequest: new RecordingRequest({
        ...commonRecording(),
        outputFilePath: path.join(tempDir, 'alice.mp4'),
      }),
    }),
    manager.startRecording({
      deviceId: 'emulator-5556',
      platform: PLATFORM_ANDROID,
      useDeviceScopedKey: true,
      recordingRequest: new RecordingRequest({
        ...commonRecording(),
        outputFilePath: path.join(tempDir, 'bob.mp4'),
      }),
    }),
  ]);

  assert.equal(aliceResult.success, true);
  assert.equal(bobResult.success, true);
  assert.equal(started.size, 2);

  const [aliceStop, bobStop] = await Promise.all([
    manager.stopRecording('run-42', 'chat__send_message', {
      platform: PLATFORM_ANDROID,
      deviceId: 'emulator-5554',
    }),
    manager.stopRecording('run-42', 'chat__send_message', {
      platform: PLATFORM_ANDROID,
      deviceId: 'emulator-5556',
    }),
  ]);
  assert.equal(aliceStop.success, true);
  assert.equal(bobStop.success, true);
  assert.equal(stopped.size, 2);
});
