import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceAppInfo } from '@finalrun/common';
import { DeviceManager } from './DeviceManager.js';

test('DeviceManager.getIOSDevices returns only booted simulators', async () => {
  const deviceManager = new DeviceManager({
    execFileFn: async () => ({
      stdout: JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
            {
              state: 'Booted',
              isAvailable: true,
              name: 'iPhone 15 Pro',
              udid: 'BOOTED-DEVICE-1',
            },
            {
              state: 'Shutdown',
              isAvailable: true,
              name: 'iPhone 15',
              udid: 'SHUTDOWN-DEVICE',
            },
          ],
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              state: 'Booted',
              isAvailable: false,
              name: 'Unavailable Simulator',
              udid: 'UNAVAILABLE-DEVICE',
            },
          ],
        },
      }),
      stderr: '',
    }),
  });

  const devices = await deviceManager.getIOSDevices();

  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.id, 'BOOTED-DEVICE-1');
  assert.equal(devices[0]?.name, 'iPhone 15 Pro');
  assert.equal(devices[0]?.sdkVersion, 17);
  assert.equal(devices[0]?.isAndroid, false);
});

test('DeviceManager.getIOSInstalledApps parses app metadata from simctl listapps', async () => {
  const deviceManager = new DeviceManager({
    execFileFn: async () => ({
      stdout: JSON.stringify({
        'org.wikipedia': {
          CFBundleDisplayName: 'Wikipedia',
          CFBundleVersion: '7.7.1',
        },
        'com.apple.mobilesafari': {
          CFBundleName: 'Safari',
        },
      }),
      stderr: '',
    }),
  });

  const apps = await deviceManager.getIOSInstalledApps('SIM-1');

  assert.deepEqual(
    apps.map((app) => app.toJson()),
    [
      new DeviceAppInfo({
        packageName: 'com.apple.mobilesafari',
        name: 'Safari',
        version: null,
      }).toJson(),
      new DeviceAppInfo({
        packageName: 'org.wikipedia',
        name: 'Wikipedia',
        version: '7.7.1',
      }).toJson(),
    ],
  );
});

test('DeviceManager.installAndroidApp uses reinstall and grant flags for app overrides', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const deviceManager = new DeviceManager({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const installed = await deviceManager.installAndroidApp(
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

test('DeviceManager.installIOSApp uses simctl install for app overrides', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const deviceManager = new DeviceManager({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const installed = await deviceManager.installIOSApp('SIM-1', '/tmp/My.app');

  assert.equal(installed, true);
  assert.deepEqual(execCalls, [
    {
      file: 'xcrun',
      args: ['simctl', 'install', 'SIM-1', '/tmp/My.app'],
    },
  ]);
});

test('DeviceManager.openAndroidDeepLink uses adb am start with the deeplink URL', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const deviceManager = new DeviceManager({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const opened = await deviceManager.openAndroidDeepLink(
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

test('DeviceManager.openIOSDeepLink uses simctl openurl', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const deviceManager = new DeviceManager({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const opened = await deviceManager.openIOSDeepLink('SIM-1', 'wikipedia://settings');

  assert.equal(opened, true);
  assert.deepEqual(execCalls, [
    {
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-1', 'wikipedia://settings'],
    },
  ]);
});
