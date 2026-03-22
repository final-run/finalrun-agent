import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceAppInfo } from '@finalrun/common';
import { SimctlClient } from './SimctlClient.js';

test('SimctlClient.listInstalledApps parses app metadata from simctl listapps', async () => {
  const simctlClient = new SimctlClient({
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

  const apps = await simctlClient.listInstalledApps('SIM-1');

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

test('SimctlClient.installApp uses simctl install for app overrides', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const simctlClient = new SimctlClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const installed = await simctlClient.installApp('SIM-1', '/tmp/My.app');

  assert.equal(installed, true);
  assert.deepEqual(execCalls, [
    {
      file: 'xcrun',
      args: ['simctl', 'install', 'SIM-1', '/tmp/My.app'],
    },
  ]);
});

test('SimctlClient.openUrl uses simctl openurl', async () => {
  const execCalls: Array<{ file: string; args: readonly string[] }> = [];
  const simctlClient = new SimctlClient({
    execFileFn: async (file, args) => {
      execCalls.push({ file, args });
      return { stdout: '', stderr: '' };
    },
  });

  const opened = await simctlClient.openUrl('SIM-1', 'wikipedia://settings');

  assert.equal(opened, true);
  assert.deepEqual(execCalls, [
    {
      file: 'xcrun',
      args: ['simctl', 'openurl', 'SIM-1', 'wikipedia://settings'],
    },
  ]);
});
