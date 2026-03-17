import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppUpload,
  DeeplinkAction,
  DeviceAppInfo,
  DeviceActionRequest,
  DeviceInfo,
  GetAppListAction,
  LaunchAppAction,
} from '@finalrun/common';
import type { GrpcDriverClient } from '../grpc/GrpcDriverClient.js';
import { Device } from './Device.js';

test('Device refreshes iOS app IDs before launchApp', async () => {
  const calls: string[] = [];
  const grpcClient = {
    isConnected: true,
    async launchApp() {
      calls.push('launch');
      return { success: true };
    },
  };

  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'SIM-1',
      deviceUUID: 'SIM-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15 Pro',
    }),
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    refreshIOSAppIdsBeforeLaunch: async () => {
      calls.push('refresh');
    },
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-1',
      action: new LaunchAppAction({
        appUpload: new AppUpload({
          id: '',
          platform: 'ios',
          packageName: 'org.wikipedia',
        }),
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.deepEqual(calls, ['refresh', 'launch']);
});

test('Device does not refresh app IDs before Android launchApp', async () => {
  let refreshCalls = 0;
  let launchCalls = 0;
  const grpcClient = {
    isConnected: true,
    async launchApp() {
      launchCalls += 1;
      return { success: true };
    },
  };

  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'emulator-5554',
      deviceUUID: 'device-1',
      isAndroid: true,
      sdkVersion: 34,
      name: 'Android Emulator',
    }),
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    refreshIOSAppIdsBeforeLaunch: async () => {
      refreshCalls += 1;
    },
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-2',
      action: new LaunchAppAction({
        appUpload: new AppUpload({
          id: '',
          platform: 'android',
          packageName: 'org.wikipedia',
        }),
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.equal(refreshCalls, 0);
  assert.equal(launchCalls, 1);
});

test('Device returns host-side iOS installed apps for GetAppListAction', async () => {
  const grpcClient = {
    isConnected: true,
    async getAppList() {
      return {
        success: true,
        apps: [],
      };
    },
  };

  const apps = [
    new DeviceAppInfo({
      packageName: 'org.wikipedia',
      name: 'Wikipedia',
      version: '7.7.1',
    }),
  ];

  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'SIM-1',
      deviceUUID: 'SIM-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15 Pro',
    }),
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    getIOSInstalledApps: async () => apps,
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-3',
      action: new GetAppListAction(),
    }),
  );

  assert.equal(response.success, true);
  assert.deepEqual(response.data, {
    apps: apps.map((app) => app.toJson()),
  });
});

test('Device executes deeplink actions through the host-side callback', async () => {
  const openedLinks: string[] = [];
  const grpcClient = {
    isConnected: true,
  };

  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'emulator-5554',
      deviceUUID: 'device-1',
      isAndroid: true,
      sdkVersion: 34,
      name: 'Android Emulator',
    }),
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    openDeepLink: async (deeplink) => {
      openedLinks.push(deeplink);
      return true;
    },
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-4',
      action: new DeeplinkAction({
        deeplink: 'wikipedia://settings',
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.deepEqual(openedLinks, ['wikipedia://settings']);
  assert.equal(response.message, 'Successfully opened deep link: wikipedia://settings');
});
