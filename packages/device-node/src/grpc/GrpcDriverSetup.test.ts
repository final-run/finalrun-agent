import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  DeviceActionRequest,
  DeviceAppInfo,
  DeviceInfo,
  ScrollAbsAction,
} from '@finalrun/common';
import type { FilePathUtil } from '@finalrun/common';
import type { DeviceManager } from '../device/DeviceManager.js';
import type { GrpcDriverClient, GrpcScreenshotResponse } from './GrpcDriverClient.js';
import { GrpcDriverSetup } from './GrpcDriverSetup.js';

class FakeGrpcClient {
  channelCreations: Array<{ host: string; port: number }> = [];
  pingResponses: boolean[];
  captureResponses: Array<GrpcScreenshotResponse | Error>;
  updateAppIdsResponses: Array<{ success: boolean; message?: string }>;
  captureCalls = 0;
  updateAppIdsCalls: string[][] = [];

  constructor(params?: {
    pingResponses?: boolean[];
    captureResponses?: Array<GrpcScreenshotResponse | Error>;
    updateAppIdsResponses?: Array<{ success: boolean; message?: string }>;
  }) {
    this.pingResponses = params?.pingResponses ?? [true];
    this.captureResponses = params?.captureResponses ?? [];
    this.updateAppIdsResponses = params?.updateAppIdsResponses ?? [{ success: true }];
  }

  createChannel(host: string, port: number): void {
    this.channelCreations.push({ host, port });
  }

  async ping(): Promise<boolean> {
    return this.pingResponses.shift() ?? false;
  }

  async getScreenshotAndHierarchy(): Promise<GrpcScreenshotResponse> {
    this.captureCalls += 1;
    const next =
      this.captureResponses.shift() ??
      new Error('No screenshot response configured');
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  async updateAppIds(appIds: string[]): Promise<{ success: boolean; message?: string }> {
    this.updateAppIdsCalls.push(appIds);
    return this.updateAppIdsResponses.shift() ?? { success: true };
  }
}

class FakeIOSDriverProcess extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 4321;

  emitExit(code: number | null, signal: NodeJS.Signals | null = null): void {
    this.emit('exit', code, signal);
  }
}

test('GrpcDriverSetup waits for screenshot capture readiness after ping succeeds', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [true],
    captureResponses: [
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      {
        success: true,
        screenshot: 'image',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
  });

  const deviceManager = {
    installAndroidApp: async () => true,
    removePortForward: async () => undefined,
    forwardPort: async () => 50051,
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => null,
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => undefined,
    startAndroidDriverFn: () => undefined,
    captureReadinessTimeoutMs: 1000,
    captureReadinessDelayMs: 0,
  });

  const device = await setup.setUp(
    new DeviceInfo({
      id: 'emulator-5554',
      deviceUUID: 'device-1',
      isAndroid: true,
      sdkVersion: 34,
      name: 'Android Emulator',
    }),
  );

  assert.equal(device.getDeviceInfo().id, 'emulator-5554');
  assert.equal(grpcClient.channelCreations.length, 1);
  assert.equal(grpcClient.captureCalls, 3);
});

test('GrpcDriverSetup fails when UiAutomation never becomes capture-ready', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [true],
    captureResponses: [
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
    ],
  });

  const deviceManager = {
    installAndroidApp: async () => true,
    removePortForward: async () => undefined,
    forwardPort: async () => 50051,
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => null,
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    startAndroidDriverFn: () => undefined,
    captureReadinessTimeoutMs: 20,
    captureReadinessDelayMs: 5,
  });

  await assert.rejects(
    () =>
      setup.setUp(
        new DeviceInfo({
          id: 'emulator-5554',
          deviceUUID: 'device-1',
          isAndroid: true,
          sdkVersion: 34,
          name: 'Android Emulator',
        }),
      ),
    /UiAutomation never became ready/,
  );
});

test('GrpcDriverSetup wires Android host-side swipe callbacks into Device', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [true],
    captureResponses: [
      {
        success: true,
        screenshot: 'image',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
  });
  const swipeCalls: Array<{
    adbPath: string;
    deviceSerial: string;
    params: Record<string, number>;
  }> = [];

  const deviceManager = {
    installAndroidApp: async () => true,
    removePortForward: async () => undefined,
    forwardPort: async () => 50051,
    performAndroidSwipe: async (
      adbPath: string,
      deviceSerial: string,
      params: Record<string, number>,
    ) => {
      swipeCalls.push({ adbPath, deviceSerial, params });
      return { success: true, message: 'scrolled via adb' };
    },
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => null,
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => undefined,
    startAndroidDriverFn: () => undefined,
    captureReadinessTimeoutMs: 1000,
    captureReadinessDelayMs: 0,
  });

  const device = await setup.setUp(
    new DeviceInfo({
      id: 'emulator-5554',
      deviceUUID: 'device-1',
      isAndroid: true,
      sdkVersion: 34,
      name: 'Android Emulator',
    }),
  );

  const response = await device.executeAction(
    new DeviceActionRequest({
      requestId: 'req-scroll-setup',
      action: new ScrollAbsAction({
        startX: 11,
        startY: 22,
        endX: 33,
        endY: 44,
        durationMs: 555,
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'scrolled via adb');
  assert.deepEqual(swipeCalls, [
    {
      adbPath: '/usr/bin/adb',
      deviceSerial: 'emulator-5554',
      params: {
        startX: 11,
        startY: 22,
        endX: 33,
        endY: 44,
        durationMs: 555,
      },
    },
  ]);
});

test('GrpcDriverSetup installs, starts, and initializes the iOS simulator driver', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [false, true],
    captureResponses: [
      {
        success: true,
        screenshot: 'image',
        hierarchy: '[]',
        screenWidth: 1179,
        screenHeight: 2556,
      },
    ],
  });
  const driverProcess = new FakeIOSDriverProcess();

  const calls: string[] = [];
  const deviceManager = {
    installIOSApp: async (deviceId: string, appPath: string) => {
      calls.push(`install:${deviceId}:${appPath}`);
      return true;
    },
    terminateIOSApp: async (deviceId: string, bundleId: string) => {
      calls.push(`terminate:${deviceId}:${bundleId}`);
    },
    startIOSDriver: (deviceId: string, port: number) => {
      calls.push(`start:${deviceId}:${port}`);
      return driverProcess;
    },
    getIOSInstalledApps: async (deviceId: string) => {
      calls.push(`appIds:${deviceId}`);
      return [
        new DeviceAppInfo({
          packageName: 'app.finalrun.iosUITests.xctrunner',
          name: 'FinalRun Driver',
        }),
        new DeviceAppInfo({
          packageName: 'org.wikipedia',
          name: 'Wikipedia',
        }),
      ];
    },
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => '/tmp/finalrun-ios-test-Runner.app',
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => {
      calls.push('ensureIOS');
    },
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => undefined,
    killStaleHostProcessesOnPortFn: async (port: number) => {
      calls.push(`cleanup:${port}`);
    },
    captureReadinessTimeoutMs: 1000,
    captureReadinessDelayMs: 0,
  });

  const device = await setup.setUp(
    new DeviceInfo({
      id: 'SIM-1',
      deviceUUID: 'SIM-1',
      isAndroid: false,
      sdkVersion: 17,
      name: 'iPhone 15 Pro',
    }),
  );

  assert.equal(device.getDeviceInfo().id, 'SIM-1');
  assert.deepEqual(calls, [
    'ensureIOS',
    'install:SIM-1:/tmp/finalrun-ios-test-Runner.app',
    'cleanup:50051',
    'terminate:SIM-1:app.finalrun.iosUITests.xctrunner',
    'start:SIM-1:50051',
    'appIds:SIM-1',
  ]);
  assert.equal(grpcClient.channelCreations.length, 1);
  assert.equal(grpcClient.captureCalls, 1);
  assert.deepEqual(grpcClient.updateAppIdsCalls, [
    ['app.finalrun.iosUITests.xctrunner', 'org.wikipedia'],
  ]);
});

test('GrpcDriverSetup fails when the iOS driver never connects over gRPC', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: new Array(240).fill(false),
  });
  const driverProcess = new FakeIOSDriverProcess();

  const deviceManager = {
    installIOSApp: async () => true,
    terminateIOSApp: async () => undefined,
    startIOSDriver: () => driverProcess,
    getIOSInstalledApps: async () => [],
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => '/tmp/finalrun-ios-test-Runner.app',
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => undefined,
    killStaleHostProcessesOnPortFn: async () => undefined,
  });

  await assert.rejects(
    () =>
      setup.setUp(
        new DeviceInfo({
          id: 'SIM-2',
          deviceUUID: 'SIM-2',
          isAndroid: false,
          sdkVersion: 17,
          name: 'iPhone 15',
        }),
      ),
    /Failed to connect to iOS simulator via gRPC after 120s/,
  );
});

test('GrpcDriverSetup surfaces an early iOS driver process exit during setup', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [false, false, false],
  });
  const driverProcess = new FakeIOSDriverProcess();
  let delayCalls = 0;

  const deviceManager = {
    installIOSApp: async () => true,
    terminateIOSApp: async () => undefined,
    startIOSDriver: () => driverProcess,
    getIOSInstalledApps: async () => [],
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => '/tmp/finalrun-ios-test-Runner.app',
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => {
      delayCalls += 1;
      if (delayCalls === 1) {
        driverProcess.stderr.write('driver crashed\n');
        driverProcess.emitExit(1);
      }
    },
    killStaleHostProcessesOnPortFn: async () => undefined,
  });

  await assert.rejects(
    () =>
      setup.setUp(
        new DeviceInfo({
          id: 'SIM-3',
          deviceUUID: 'SIM-3',
          isAndroid: false,
          sdkVersion: 17,
          name: 'iPhone 15 Pro Max',
        }),
      ),
    /iOS driver process exited before setup completed/,
  );
});

test('GrpcDriverSetup fails when iOS screenshot capture never becomes ready after ping', async () => {
  const grpcClient = new FakeGrpcClient({
    pingResponses: [true],
    captureResponses: [
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
    ],
  });
  const driverProcess = new FakeIOSDriverProcess();

  const deviceManager = {
    installIOSApp: async () => true,
    terminateIOSApp: async () => undefined,
    startIOSDriver: () => driverProcess,
    getIOSInstalledApps: async () => [
      new DeviceAppInfo({
        packageName: 'org.wikipedia',
        name: 'Wikipedia',
      }),
    ],
  } as unknown as DeviceManager;

  const filePathUtil: FilePathUtil = {
    getADBPath: async () => '/usr/bin/adb',
    getDriverAppPath: async () => '/tmp/app-debug.apk',
    getDriverTestAppPath: async () => '/tmp/app-debug-androidTest.apk',
    getIOSDriverAppPath: async () => '/tmp/finalrun-ios-test-Runner.app',
    getAppFilePath: async (appFileName: string) => appFileName,
    ensureIOSAppsAvailable: async () => undefined,
  };

  const setup = new GrpcDriverSetup({
    deviceManager,
    filePathUtil,
    grpcClientFactory: () => grpcClient as unknown as GrpcDriverClient,
    delayFn: async () => undefined,
    killStaleHostProcessesOnPortFn: async () => undefined,
    captureReadinessTimeoutMs: 20,
    captureReadinessDelayMs: 5,
  });

  await assert.rejects(
    () =>
      setup.setUp(
        new DeviceInfo({
          id: 'SIM-4',
          deviceUUID: 'SIM-4',
          isAndroid: false,
          sdkVersion: 17,
          name: 'iPhone 14',
        }),
      ),
    /screenshot capture never became ready/,
  );
});
