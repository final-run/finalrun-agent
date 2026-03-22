import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppUpload,
  DeviceAppInfo,
  LaunchAppAction,
  ScrollAbsAction,
} from '@finalrun/common';
import type { GrpcDriverClient } from '../../grpc/GrpcDriverClient.js';
import { CommonDriverActions } from '../shared/CommonDriverActions.js';
import { IOSSimulator } from './IOSSimulator.js';

test('IOSSimulator refreshes app IDs before launchApp', async () => {
  const calls: string[] = [];
  const grpcClient = {
    isConnected: true,
    async updateAppIds(appIds: string[]) {
      calls.push(`update:${appIds.join(',')}`);
      return { success: true };
    },
    async launchApp() {
      calls.push('launch');
      return { success: true, message: 'launched' };
    },
    close() {},
  };

  const runtime = new IOSSimulator({
    commonDriverActions: new CommonDriverActions({
      grpcClient: grpcClient as unknown as GrpcDriverClient,
    }),
    simctlClient: {
      async listInstalledAppIds() {
        calls.push('listAppIds');
        return ['app.finalrun.iosUITests.xctrunner', 'org.wikipedia'];
      },
      async terminateApp() {},
      async listInstalledApps() {
        return [];
      },
      async openUrl() {
        return true;
      },
    } as never,
    deviceId: 'SIM-1',
  });

  const response = await runtime.launchApp(
    new LaunchAppAction({
      appUpload: new AppUpload({
        id: '',
        platform: 'ios',
        packageName: 'org.wikipedia',
      }),
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'launched');
  assert.deepEqual(calls, [
    'listAppIds',
    'update:app.finalrun.iosUITests.xctrunner,org.wikipedia',
    'launch',
  ]);
});

test('IOSSimulator routes scroll through gRPC swipe and installed-app listing through simctl', async () => {
  const grpcSwipeCalls: Array<Record<string, number>> = [];
  const runtime = new IOSSimulator({
    commonDriverActions: new CommonDriverActions({
      grpcClient: {
        isConnected: true,
        async swipe(params: Record<string, number>) {
          grpcSwipeCalls.push(params);
          return { success: true, message: 'scrolled via grpc' };
        },
        close() {},
      } as unknown as GrpcDriverClient,
    }),
    simctlClient: {
      async listInstalledApps() {
        return [
          new DeviceAppInfo({
            packageName: 'org.wikipedia',
            name: 'Wikipedia',
            version: '7.7.1',
          }),
        ];
      },
      async listInstalledAppIds() {
        return [];
      },
      async terminateApp() {},
      async openUrl() {
        return true;
      },
    } as never,
    deviceId: 'SIM-1',
  });

  const scrollResponse = await runtime.scrollAbs(
    new ScrollAbsAction({
      startX: 50,
      startY: 60,
      endX: 70,
      endY: 80,
      durationMs: 600,
    }),
  );
  const appListResponse = await runtime.getInstalledAppsResponse();

  assert.equal(scrollResponse.success, true);
  assert.equal(scrollResponse.message, 'scrolled via grpc');
  assert.deepEqual(grpcSwipeCalls, [
    { startX: 50, startY: 60, endX: 70, endY: 80, durationMs: 600 },
  ]);
  assert.deepEqual(appListResponse.data, {
    apps: [
      {
        packageName: 'org.wikipedia',
        name: 'Wikipedia',
        version: '7.7.1',
      },
    ],
  });
});

test('IOSSimulator terminates the runner before closing gRPC', async () => {
  const calls: string[] = [];
  const runtime = new IOSSimulator({
    commonDriverActions: new CommonDriverActions({
      grpcClient: {
        isConnected: true,
        close() {
          calls.push('close');
        },
      } as unknown as GrpcDriverClient,
    }),
    simctlClient: {
      async terminateApp() {
        calls.push('terminate');
      },
      async listInstalledAppIds() {
        return [];
      },
      async listInstalledApps() {
        return [];
      },
      async openUrl() {
        return true;
      },
    } as never,
    deviceId: 'SIM-1',
  });

  await runtime.close();

  assert.deepEqual(calls, ['terminate', 'close']);
});
