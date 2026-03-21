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
      testRunId: 'run 1',
      testCaseId: 'case/name',
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

test('RecordingManager reports unsupported platforms when no provider is configured', async () => {
  const manager = new RecordingManager({
    providers: {},
  });

  const response = await manager.startRecording({
    deviceId: 'emulator-5554',
    platform: PLATFORM_ANDROID,
    recordingRequest: new RecordingRequest({
      testRunId: 'run',
      testCaseId: 'case',
      apiKey: 'key',
    }),
  });

  assert.equal(response.success, false);
  assert.equal(
    response.message,
    'Screen recording is not configured for platform: android',
  );
});
