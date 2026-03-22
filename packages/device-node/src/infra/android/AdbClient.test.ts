import assert from 'node:assert/strict';
import test from 'node:test';
import { AdbClient } from './AdbClient.js';

test('AdbClient.installApp uses reinstall and grant flags for app overrides', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const installed = await adbClient.installApp(
    '/platform-tools/adb',
    'emulator-5554',
    '/tmp/app.apk',
  );

  assert.equal(installed, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: ['-s', 'emulator-5554', 'install', '-r', '-g', '/tmp/app.apk'],
    },
  ]);
});

test('AdbClient.openDeepLink uses adb am start with the deeplink URL', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const opened = await adbClient.openDeepLink(
    '/platform-tools/adb',
    'emulator-5554',
    'wikipedia://settings',
  );

  assert.equal(opened, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-W',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        'wikipedia://settings',
      ],
    },
  ]);
});

test('AdbClient.swipe uses adb input swipe with absolute coordinates', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const result = await adbClient.swipe('/platform-tools/adb', 'emulator-5554', {
    startX: 10,
    startY: 20,
    endX: 30,
    endY: 40,
    durationMs: 700,
  });

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'swipe',
        '10',
        '20',
        '30',
        '40',
        '700',
      ],
    },
  ]);
});
