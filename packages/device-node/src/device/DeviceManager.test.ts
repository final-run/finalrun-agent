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
