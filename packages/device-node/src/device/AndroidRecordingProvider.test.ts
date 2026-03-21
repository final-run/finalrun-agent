import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'child_process';
import { RecordingRequest } from '@finalrun/common';
import { AndroidRecordingProvider } from './AndroidRecordingProvider.js';

class FakeChildProcess extends EventEmitter {
  pid: number | undefined = 1234;
  exitCode: number | null = null;
  stdout = new PassThrough();
  stderr = new PassThrough();
  killSignals: Array<NodeJS.Signals | number | undefined> = [];

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(signal);
    this.exitCode = 0;
    queueMicrotask(() => {
      this.emit('exit', 0, signal ?? null);
    });
    return true;
  }
}

test('AndroidRecordingProvider starts headless scrcpy with the selected device serial and mp4 output path', async () => {
  const process = new FakeChildProcess();
  const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
  const provider = new AndroidRecordingProvider({
    execFileFn: async () => ({ stdout: '/usr/bin/scrcpy', stderr: '' }),
    spawnFn: (((command: string, args?: readonly string[]) => {
      spawnCalls.push({ command, args: args ?? [] });
      return process as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as unknown) as typeof import('child_process').spawn,
    delayFn: async () => {},
  });

  const response = await provider.startRecordingProcess({
    deviceId: 'emulator-5554',
    filePath: '/tmp/run_case.mp4',
    recordingRequest: new RecordingRequest({
      testRunId: 'run',
      testCaseId: 'case',
      apiKey: 'key',
    }),
  });

  assert.equal(response.response.success, true);
  assert.deepEqual(spawnCalls, [
    {
      command: 'scrcpy',
      args: [
        '--serial',
        'emulator-5554',
        '--no-window',
        '--no-playback',
        '--no-control',
        '--no-audio',
        '--record',
        '/tmp/run_case.mp4',
        '--record-format',
        'mp4',
      ],
    },
  ]);
});

test('AndroidRecordingProvider fails startup if scrcpy exits during the readiness window', async () => {
  const process = new FakeChildProcess();
  const provider = new AndroidRecordingProvider({
    execFileFn: async () => ({ stdout: '/usr/bin/scrcpy', stderr: '' }),
    spawnFn: (((_command: string, _args?: readonly string[]) => {
      queueMicrotask(() => {
        process.stderr.write('adb device unauthorized');
        process.exitCode = 1;
        process.emit('exit', 1, null);
      });
      return process as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as unknown) as typeof import('child_process').spawn,
    delayFn: async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
  });

  await assert.rejects(
    () =>
      provider.startRecordingProcess({
        deviceId: 'emulator-5554',
        filePath: '/tmp/run_case.mp4',
        recordingRequest: new RecordingRequest({
          testRunId: 'run',
          testCaseId: 'case',
          apiKey: 'key',
        }),
      }),
    /scrcpy exited before recording became ready: adb device unauthorized/,
  );
});

test('AndroidRecordingProvider stops with SIGINT and validates the recorded mp4 output', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'finalrun-android-recording-'));
  const recordingPath = path.join(tempDir, 'run_case.mp4');
  await writeFile(recordingPath, 'fake-recording');

  const process = new FakeChildProcess();
  const provider = new AndroidRecordingProvider({
    execFileFn: async () => ({ stdout: '/usr/bin/scrcpy', stderr: '' }),
  });

  const response = await provider.stopRecordingProcess({
    process: process as unknown as ChildProcess,
    deviceId: 'emulator-5554',
    fileName: 'run_case',
    filePath: recordingPath,
  });

  assert.equal(response.success, true);
  assert.deepEqual(process.killSignals, ['SIGINT']);
});

test('AndroidRecordingProvider availability reports when scrcpy is missing', async () => {
  const provider = new AndroidRecordingProvider({
    execFileFn: async () => {
      throw new Error('scrcpy missing');
    },
  });

  const response = await provider.checkAvailability();

  assert.equal(response.success, false);
  assert.match(response.message ?? '', /scrcpy not found/i);
});
