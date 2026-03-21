import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppUpload,
  DeeplinkAction,
  DeviceAppInfo,
  DeviceActionRequest,
  DeviceInfo,
  DeviceNodeResponse,
  GetAppListAction,
  LaunchAppAction,
  RecordingRequest,
  ScrollAbsAction,
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

test('Device routes Android scroll actions through the host-side swipe callback', async () => {
  const swipeCalls: Array<Record<string, number>> = [];
  let grpcSwipeCalls = 0;
  const grpcClient = {
    isConnected: true,
    async swipe() {
      grpcSwipeCalls += 1;
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
    performAndroidSwipe: async (params) => {
      swipeCalls.push(params);
      return { success: true, message: 'scrolled via adb' };
    },
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-scroll-1',
      action: new ScrollAbsAction({
        startX: 10,
        startY: 20,
        endX: 30,
        endY: 40,
        durationMs: 500,
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'scrolled via adb');
  assert.equal(grpcSwipeCalls, 0);
  assert.deepEqual(swipeCalls, [
    { startX: 10, startY: 20, endX: 30, endY: 40, durationMs: 500 },
  ]);
});

test('Device routes iOS scroll actions through gRPC swipe', async () => {
  const grpcSwipeCalls: Array<Record<string, number>> = [];
  const grpcClient = {
    isConnected: true,
    async swipe(params: Record<string, number>) {
      grpcSwipeCalls.push(params);
      return { success: true, message: 'scrolled via grpc' };
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
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-scroll-2',
      action: new ScrollAbsAction({
        startX: 50,
        startY: 60,
        endX: 70,
        endY: 80,
        durationMs: 600,
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'scrolled via grpc');
  assert.deepEqual(grpcSwipeCalls, [
    { startX: 50, startY: 60, endX: 70, endY: 80, durationMs: 600 },
  ]);
});

test('Device returns a clear error when Android scroll callback is missing', async () => {
  let grpcSwipeCalls = 0;
  const grpcClient = {
    isConnected: true,
    async swipe() {
      grpcSwipeCalls += 1;
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
  });

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-scroll-3',
      action: new ScrollAbsAction({
        startX: 5,
        startY: 15,
        endX: 25,
        endY: 35,
        durationMs: 400,
      }),
    }),
  );

  assert.equal(response.success, false);
  assert.equal(
    response.message,
    'Android scroll actions require a host-side swipe handler, but none is configured.',
  );
  assert.equal(grpcSwipeCalls, 0);
});

test('Device delegates startRecording through the recording controller with the device platform', async () => {
  const calls: Array<Record<string, unknown>> = [];
  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'SIM-1',
      deviceUUID: 'SIM-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15 Pro',
    }),
    grpcClient: {
      isConnected: true,
      close() {},
    } as unknown as GrpcDriverClient,
    recordingController: {
      async startRecording(params) {
        calls.push(params as unknown as Record<string, unknown>);
        return new DeviceNodeResponse({ success: true, message: 'started' });
      },
      async stopRecording() {
        return new DeviceNodeResponse({ success: true });
      },
      async cleanupDevice() {},
      async abortRecording() {},
    },
  });

  const response = await device.startRecording(
    new RecordingRequest({
      testRunId: 'run',
      testCaseId: 'case',
      apiKey: 'key',
    }),
  );

  assert.equal(response.success, true);
  assert.deepEqual(calls, [
    {
      deviceId: 'SIM-1',
      platform: 'ios',
      sdkVersion: '17',
      recordingRequest: new RecordingRequest({
        testRunId: 'run',
        testCaseId: 'case',
        apiKey: 'key',
      }),
    },
  ]);
});

test('Device.closeConnection cleans up active recordings before closing gRPC', async () => {
  const calls: string[] = [];
  const device = new Device({
    deviceInfo: new DeviceInfo({
      id: 'SIM-1',
      deviceUUID: 'SIM-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15 Pro',
    }),
    grpcClient: {
      isConnected: true,
      close() {
        calls.push('close');
      },
    } as unknown as GrpcDriverClient,
    recordingController: {
      async startRecording() {
        return new DeviceNodeResponse({ success: true });
      },
      async stopRecording() {
        return new DeviceNodeResponse({ success: true });
      },
      async cleanupDevice() {
        calls.push('cleanup');
      },
      async abortRecording() {},
    },
  });

  await device.closeConnection();

  assert.deepEqual(calls, ['cleanup', 'close']);
});
