import { DeviceNodeResponse } from '@finalrun/common';
import type { GrpcDriverClient } from '../grpc/GrpcDriverClient.js';
import type { DeviceSession } from '../device/DeviceSession.js';
import {
  ScreenshotCaptureHelper,
  waitForCaptureReadiness,
} from '../device/ScreenshotCapture.js';

export interface CaptureReadinessOptions {
  timeoutMs?: number;
  delayMs?: number;
}

export class ScreenshotCaptureCoordinator {
  private _helper: ScreenshotCaptureHelper;

  constructor(params: {
    grpcClient: GrpcDriverClient;
    session: DeviceSession;
  }) {
    this._helper = new ScreenshotCaptureHelper({
      grpcClient: params.grpcClient,
      session: params.session,
    });
  }

  async capture(traceStep?: number | null): Promise<DeviceNodeResponse> {
    return await this._helper.capture(traceStep);
  }
}

export async function waitForDriverCaptureReadiness(
  grpcClient: GrpcDriverClient,
  options?: CaptureReadinessOptions,
): Promise<{ ready: boolean; message: string | null }> {
  return await waitForCaptureReadiness(grpcClient, options);
}
