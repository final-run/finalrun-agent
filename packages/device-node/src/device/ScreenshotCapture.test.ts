import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  GrpcDriverClient,
  GrpcRawScreenshotResponse,
  GrpcScreenshotResponse,
} from '../grpc/GrpcDriverClient.js';
import { DeviceSession } from './DeviceSession.js';
import { ScreenshotCaptureHelper } from './ScreenshotCapture.js';

class FakeGrpcClient {
  captureCalls = 0;
  rawScreenshotCalls = 0;
  captureResponses: Array<GrpcScreenshotResponse | Error>;
  rawScreenshotResponses: Array<GrpcRawScreenshotResponse | Error>;

  constructor(params?: {
    captureResponses?: Array<GrpcScreenshotResponse | Error>;
    rawScreenshotResponses?: Array<GrpcRawScreenshotResponse | Error>;
  }) {
    this.captureResponses = params?.captureResponses ?? [];
    this.rawScreenshotResponses = params?.rawScreenshotResponses ?? [];
  }

  async getScreenshotAndHierarchy(): Promise<GrpcScreenshotResponse> {
    this.captureCalls += 1;
    const next =
      this.captureResponses.shift() ??
      new Error('No capture response configured');
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  async getRawScreenshot(): Promise<GrpcRawScreenshotResponse> {
    this.rawScreenshotCalls += 1;
    const next =
      this.rawScreenshotResponses.shift() ??
      new Error('No raw screenshot response configured');
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }
}

test('ScreenshotCaptureHelper retries transient failures when stability is disabled', async () => {
  const session = new DeviceSession();
  session.setShouldEnsureStability(false);

  const grpcClient = new FakeGrpcClient({
    captureResponses: [
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      { success: false, message: 'UiAutomation not connected', screenWidth: 0, screenHeight: 0 },
      {
        success: true,
        screenshot: 'base64-image',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
  });

  const helper = new ScreenshotCaptureHelper({
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    session,
  });

  const response = await helper.capture();

  assert.equal(response.success, true);
  assert.equal(grpcClient.captureCalls, 3);
  assert.equal(response.data?.['screenshot'], 'base64-image');
  assert.equal(response.data?.['screenWidth'], 1080);
});

test('ScreenshotCaptureHelper waits for stable raw screenshots before final capture', async () => {
  const session = new DeviceSession();
  session.setShouldEnsureStability(true);

  const grpcClient = new FakeGrpcClient({
    rawScreenshotResponses: [
      {
        success: true,
        screenshot: Buffer.from('frame-a'),
        screenWidth: 1080,
        screenHeight: 2400,
      },
      {
        success: true,
        screenshot: Buffer.from('frame-a'),
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
    captureResponses: [
      {
        success: true,
        screenshot: 'stable-image',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
  });

  const helper = new ScreenshotCaptureHelper({
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    session,
  });

  const response = await helper.capture();

  assert.equal(response.success, true);
  assert.equal(grpcClient.rawScreenshotCalls, 2);
  assert.equal(grpcClient.captureCalls, 1);
  assert.equal(response.data?.['screenshot'], 'stable-image');
});

test('ScreenshotCaptureHelper exhausts retries on invalid hierarchy payloads', async () => {
  const session = new DeviceSession();
  session.setShouldEnsureStability(false);

  const grpcClient = new FakeGrpcClient({
    captureResponses: [
      {
        success: true,
        screenshot: 'base64-image',
        hierarchy: 'not-json',
        screenWidth: 1080,
        screenHeight: 2400,
      },
      {
        success: true,
        screenshot: 'base64-image',
        hierarchy: 'not-json',
        screenWidth: 1080,
        screenHeight: 2400,
      },
      {
        success: true,
        screenshot: 'base64-image',
        hierarchy: 'not-json',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    ],
  });

  const helper = new ScreenshotCaptureHelper({
    grpcClient: grpcClient as unknown as GrpcDriverClient,
    session,
  });

  const response = await helper.capture();

  assert.equal(response.success, false);
  assert.equal(response.message, 'Invalid hierarchy JSON from driver');
  assert.equal(grpcClient.captureCalls, 3);
});
