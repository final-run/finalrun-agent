import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceDiscoveryService } from './DeviceDiscoveryService.js';

test('DeviceDiscoveryService returns only booted iOS simulators', async () => {
  const discoveryService = new DeviceDiscoveryService({
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

  const devices = await discoveryService.getIOSDevices();

  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.id, 'BOOTED-DEVICE-1');
  assert.equal(devices[0]?.name, 'iPhone 15 Pro');
  assert.equal(devices[0]?.sdkVersion, 17);
  assert.equal(devices[0]?.isAndroid, false);
});

test('DeviceDiscoveryService parses Android device metadata from adb', async () => {
  const calls: Array<{ file: string; args: readonly string[] }> = [];
  const discoveryService = new DeviceDiscoveryService({
    execFileFn: async (file, args) => {
      calls.push({ file, args });
      if (args[0] === 'devices') {
        return {
          stdout: [
            'List of devices attached',
            'emulator-5554          device product:sdk_gphone model:Pixel_8 device:emu64xa',
            '',
          ].join('\n'),
          stderr: '',
        };
      }
      if (args.includes('ro.build.version.sdk')) {
        return { stdout: '34\n', stderr: '' };
      }
      if (args.includes('ro.product.model')) {
        return { stdout: 'Pixel 8\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    },
  });

  const devices = await discoveryService.getAndroidDevices('/platform-tools/adb');

  assert.equal(devices.length, 1);
  assert.equal(devices[0]?.id, 'emulator-5554');
  assert.equal(devices[0]?.name, 'Pixel 8');
  assert.equal(devices[0]?.sdkVersion, 34);
  assert.deepEqual(calls.map((call) => call.args), [
    ['devices', '-l'],
    ['-s', 'emulator-5554', 'shell', 'getprop', 'ro.build.version.sdk'],
    ['-s', 'emulator-5554', 'shell', 'getprop', 'ro.product.model'],
  ]);
});
