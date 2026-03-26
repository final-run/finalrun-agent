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

test('AdbClient.performKeyPress maps logical keys to adb key events', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const result = await adbClient.performKeyPress(
    '/platform-tools/adb',
    'emulator-5554',
    'enter',
  );

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'keyevent',
        'KEYCODE_ENTER',
      ],
    },
  ]);
});

test('AdbClient.hideKeyboard presses back only when the keyboard is visible', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      if (args.includes('dumpsys')) {
        return { stdout: 'mInputShown=true', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  });

  const result = await adbClient.hideKeyboard('/platform-tools/adb', 'emulator-5554');

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: ['-s', 'emulator-5554', 'shell', 'dumpsys', 'input_method'],
    },
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'keyevent',
        'KEYCODE_BACK',
      ],
    },
  ]);
});

test('AdbClient.launchAppCli resolves the launcher activity before launching', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      if (args.includes('resolve-activity')) {
        return {
          stdout: 'com.example.app/.MainActivity\n',
          stderr: '',
        };
      }
      return { stdout: '', stderr: '' };
    },
  });

  const result = await adbClient.launchAppCli(
    '/platform-tools/adb',
    'emulator-5554',
    'com.example.app',
    {
      foo: {
        key: 'foo',
        type: 'arg',
        value: 'bar',
      },
    },
  );

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'cmd',
        'package',
        'resolve-activity',
        '--brief',
        'com.example.app',
        '-c',
        'android.intent.category.LAUNCHER',
      ],
    },
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-W',
        '-n',
        'com.example.app/.MainActivity',
        '-e',
        'foo',
        'bar',
      ],
    },
  ]);
});

test('AdbClient.togglePermissions uses pm grant and appops for Android permission helpers', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const adbClient = new AdbClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const result = await adbClient.togglePermissions(
    '/platform-tools/adb',
    'emulator-5554',
    'com.example.app',
    {
      camera: 'allow',
      overlay: 'deny',
    },
  );

  assert.equal(result.success, true);
  assert.deepEqual(execCalls, [
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'pm',
        'grant',
        'com.example.app',
        'android.permission.CAMERA',
      ],
    },
    {
      file: '/platform-tools/adb',
      args: [
        '-s',
        'emulator-5554',
        'shell',
        'appops',
        'set',
        'com.example.app',
        'SYSTEM_ALERT_WINDOW',
        'deny',
      ],
    },
  ]);
});
