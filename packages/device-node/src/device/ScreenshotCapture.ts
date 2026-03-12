import { createHash } from 'crypto';
import { DeviceNodeResponse, Logger } from '@finalrun/common';
import type {
  GrpcDriverClient,
  GrpcRawScreenshotResponse,
  GrpcScreenshotResponse,
} from '../grpc/GrpcDriverClient.js';
import type { DeviceSession } from './DeviceSession.js';

export interface CaptureValidationResult {
  valid: boolean;
  transient: boolean;
  message: string | null;
}

interface CaptureAttemptResult {
  success: boolean;
  transient: boolean;
  message: string | null;
  data?: Record<string, unknown>;
}

interface CaptureReadinessOptions {
  timeoutMs?: number;
  delayMs?: number;
}

const SCREENSHOT_CAPTURE_RETRY_ATTEMPTS = 3;
const SCREENSHOT_CAPTURE_RETRY_DELAY_MS = 300;
const SCREENSHOT_STABILITY_TIMEOUT_MS = 5000;
const SCREENSHOT_STABILITY_POLL_DELAY_MS = 300;
const DEFAULT_CAPTURE_READINESS_TIMEOUT_MS = 15000;
const DEFAULT_CAPTURE_READINESS_DELAY_MS = 500;

const TRANSIENT_CAPTURE_PATTERNS = [
  /uiautomation not connected/i,
  /\bunavailable\b/i,
  /no connection established/i,
  /empty screenshot/i,
  /missing hierarchy/i,
  /invalid hierarchy/i,
];

export function isTransientCaptureFailureMessage(
  message: string | null | undefined,
): boolean {
  if (!message) {
    return false;
  }

  return TRANSIENT_CAPTURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function validateScreenshotCaptureResponse(
  response: GrpcScreenshotResponse,
): CaptureValidationResult {
  if (!response.success) {
    const message = response.message ?? 'Driver rejected screenshot capture';
    return {
      valid: false,
      transient: isTransientCaptureFailureMessage(message),
      message,
    };
  }

  const screenshot = response.screenshot?.trim();
  if (!screenshot) {
    return {
      valid: false,
      transient: true,
      message: 'Empty screenshot from driver',
    };
  }

  const hierarchy = response.hierarchy?.trim();
  if (!hierarchy) {
    return {
      valid: false,
      transient: true,
      message: 'Missing hierarchy from driver',
    };
  }

  try {
    JSON.parse(hierarchy);
  } catch {
    return {
      valid: false,
      transient: true,
      message: 'Invalid hierarchy JSON from driver',
    };
  }

  return {
    valid: true,
    transient: false,
    message: null,
  };
}

export async function waitForCaptureReadiness(
  grpcClient: GrpcDriverClient,
  options?: CaptureReadinessOptions,
): Promise<{ ready: boolean; message: string | null }> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_CAPTURE_READINESS_TIMEOUT_MS;
  const delayMs = options?.delayMs ?? DEFAULT_CAPTURE_READINESS_DELAY_MS;
  const startedAt = Date.now();
  let lastMessage: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const attempt = await captureScreenshotPayload(grpcClient, 'debug');
    if (attempt.success) {
      return { ready: true, message: null };
    }

    lastMessage = attempt.message;
    if (!attempt.transient) {
      return { ready: false, message: attempt.message };
    }

    await delay(delayMs);
  }

  return {
    ready: false,
    message:
      lastMessage ??
      'Driver started but UiAutomation never became ready for screenshot capture',
  };
}

export class ScreenshotCaptureHelper {
  private _grpcClient: GrpcDriverClient;
  private _session: DeviceSession;

  constructor(params: {
    grpcClient: GrpcDriverClient;
    session: DeviceSession;
  }) {
    this._grpcClient = params.grpcClient;
    this._session = params.session;
  }

  async capture(): Promise<DeviceNodeResponse> {
    if (this._session.shouldEnsureStability) {
      const screenWasStable = await this._waitForStableScreen();
      if (!screenWasStable) {
        Logger.d(
          'ScreenshotCaptureHelper: Stability timeout reached; falling back to a final capture attempt',
        );
      }

      const finalAttempt = await captureScreenshotPayload(this._grpcClient, 'error');
      return this._toResponse(finalAttempt);
    }

    const attempt = await this._captureWithRetry(
      SCREENSHOT_CAPTURE_RETRY_ATTEMPTS,
    );
    return this._toResponse(attempt);
  }

  private async _captureWithRetry(
    maxAttempts: number,
  ): Promise<CaptureAttemptResult> {
    let lastAttempt: CaptureAttemptResult = {
      success: false,
      transient: false,
      message: 'Screenshot capture failed before any attempts were made',
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastAttempt = await captureScreenshotPayload(
        this._grpcClient,
        attempt < maxAttempts ? 'debug' : 'error',
      );
      if (lastAttempt.success || !lastAttempt.transient || attempt === maxAttempts) {
        return lastAttempt;
      }

      await delay(SCREENSHOT_CAPTURE_RETRY_DELAY_MS);
    }

    return lastAttempt;
  }

  private async _waitForStableScreen(): Promise<boolean> {
    const startedAt = Date.now();
    let previousHash: string | null = null;

    while (Date.now() - startedAt < SCREENSHOT_STABILITY_TIMEOUT_MS) {
      const response = await this._getRawScreenshot();
      const currentHash = hashRawScreenshot(response);
      if (currentHash && currentHash === previousHash) {
        return true;
      }

      previousHash = currentHash;
      await delay(SCREENSHOT_STABILITY_POLL_DELAY_MS);
    }

    return false;
  }

  private async _getRawScreenshot(): Promise<GrpcRawScreenshotResponse | null> {
    try {
      const response = await this._grpcClient.getRawScreenshot(undefined, {
        errorLogLevel: 'debug',
      });

      if (!response.success || !response.screenshot || response.screenshot.length === 0) {
        return null;
      }

      return response;
    } catch {
      return null;
    }
  }

  private _toResponse(attempt: CaptureAttemptResult): DeviceNodeResponse {
    return new DeviceNodeResponse({
      success: attempt.success,
      message: attempt.message,
      data: attempt.data ?? null,
    });
  }
}

async function captureScreenshotPayload(
  grpcClient: GrpcDriverClient,
  errorLogLevel: 'error' | 'debug' | 'silent',
): Promise<CaptureAttemptResult> {
  try {
    const response = await grpcClient.getScreenshotAndHierarchy(undefined, {
      errorLogLevel,
    });
    const validation = validateScreenshotCaptureResponse(response);
    if (!validation.valid) {
      return {
        success: false,
        transient: validation.transient,
        message: validation.message,
      };
    }

    return {
      success: true,
      transient: false,
      message: null,
      data: {
        screenshot: response.screenshot,
        hierarchy: response.hierarchy,
        screenWidth: response.screenWidth,
        screenHeight: response.screenHeight,
        deviceTime: response.deviceTime,
        timezone: response.timezone,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      transient: isTransientCaptureFailureMessage(message),
      message,
    };
  }
}

function hashRawScreenshot(
  response: GrpcRawScreenshotResponse | null,
): string | null {
  if (!response?.success || !response.screenshot || response.screenshot.length === 0) {
    return null;
  }

  return createHash('sha1').update(response.screenshot).digest('hex');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
