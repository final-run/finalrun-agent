import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeeplinkAction,
  DeviceAppInfo,
  ScrollAbsAction,
} from '@finalrun/common';
import type { GrpcDriverClient } from '../../grpc/GrpcDriverClient.js';
import { CommonDriverActions } from '../shared/CommonDriverActions.js';
import { AndroidDevice } from './AndroidDevice.js';

test('AndroidDevice routes scroll through adb instead of gRPC swipe', async () => {
  const swipeCalls: Array<Record<string, number>> = [];
  let grpcSwipeCalls = 0;
  const grpcClient = {
    isConnected: true,
    async swipe() {
      grpcSwipeCalls += 1;
      return { success: true };
    },
    close() {},
  };

  const runtime = new AndroidDevice({
    commonDriverActions: new CommonDriverActions({
      grpcClient: grpcClient as unknown as GrpcDriverClient,
    }),
    adbClient: {
      async swipe(
        _adbPath: string,
        _deviceSerial: string,
        params: Record<string, number>,
      ) {
        swipeCalls.push(params);
        return { success: true, message: 'scrolled via adb' };
      },
      async removePortForward() {},
    } as never,
    adbPath: '/usr/bin/adb',
    deviceSerial: 'emulator-5554',
  });

  const response = await runtime.scrollAbs(
    new ScrollAbsAction({
      startX: 10,
      startY: 20,
      endX: 30,
      endY: 40,
      durationMs: 500,
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'scrolled via adb');
  assert.equal(grpcSwipeCalls, 0);
  assert.deepEqual(swipeCalls, [
    { startX: 10, startY: 20, endX: 30, endY: 40, durationMs: 500 },
  ]);
});

test('AndroidDevice opens deep links through adb', async () => {
  const openedLinks: string[] = [];
  const runtime = new AndroidDevice({
    commonDriverActions: new CommonDriverActions({
      grpcClient: {
        isConnected: true,
        close() {},
      } as unknown as GrpcDriverClient,
    }),
    adbClient: {
      async openDeepLink(
        _adbPath: string,
        _deviceSerial: string,
        deeplink: string,
      ) {
        openedLinks.push(deeplink);
        return true;
      },
      async removePortForward() {},
    } as never,
    adbPath: '/usr/bin/adb',
    deviceSerial: 'emulator-5554',
  });

  const response = await runtime.openDeepLink(
    new DeeplinkAction({
      deeplink: 'wikipedia://settings',
    }),
  );

  assert.equal(response.success, true);
  assert.equal(response.message, 'Successfully opened deep link: wikipedia://settings');
  assert.deepEqual(openedLinks, ['wikipedia://settings']);
});

test('AndroidDevice keeps installed-app listing on driver gRPC and removes port forwarding on close', async () => {
  const calls: string[] = [];
  const runtime = new AndroidDevice({
    commonDriverActions: new CommonDriverActions({
      grpcClient: {
        isConnected: true,
        async getAppList() {
          return {
            success: true,
            apps: [
              new DeviceAppInfo({
                packageName: 'org.wikipedia',
                name: 'Wikipedia',
                version: '7.7.1',
              }),
            ],
          };
        },
        close() {
          calls.push('close');
        },
      } as unknown as GrpcDriverClient,
    }),
    adbClient: {
      async removePortForward() {
        calls.push('removePortForward');
      },
    } as never,
    adbPath: '/usr/bin/adb',
    deviceSerial: 'emulator-5554',
  });

  const appListResponse = await runtime.getInstalledAppsResponse();
  await runtime.close();

  assert.equal(appListResponse.success, true);
  assert.deepEqual(appListResponse.data, {
    apps: [
      {
        packageName: 'org.wikipedia',
        name: 'Wikipedia',
        version: '7.7.1',
      },
    ],
  });
  assert.deepEqual(calls, ['removePortForward', 'close']);
});
