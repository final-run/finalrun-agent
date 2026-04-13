import { createHash } from 'crypto';
import { performance } from 'node:perf_hooks';
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

export interface CaptureTraceMetadata {
  totalMs: number;
  stabilityMs?: number;
  finalPayloadMs: number;
  stable: boolean;
  pollCount: number;
  attempts: number;
  failureReason?: string;
}

interface CaptureAttemptResult {
  success: boolean;
  transient: boolean;
  message: string | null;
  data?: Record<string, unknown>;
  durationMs: number;
  attempts: number;
}

interface CaptureLogContext {
  phase: string;
  traceStep?: number | null;
  attempt?: number;
  totalAttempts?: number;
}

interface CaptureReadinessOptions {
  timeoutMs?: number;
  delayMs?: number;
}

interface StabilityWaitResult {
  stable: boolean;
  durationMs: number;
  pollCount: number;
}

interface ActiveCapturePhase {
  traceStep: number;
  phase: string;
  startedAt: number;
}

type TraceStatus = 'success' | 'failure';

const SCREENSHOT_CAPTURE_RETRY_ATTEMPTS = 3;
const SCREENSHOT_CAPTURE_RETRY_DELAY_MS = 300;
const SCREENSHOT_STABILITY_TIMEOUT_MS = 5000;
const SCREENSHOT_STABILITY_POLL_DELAY_MS = 300;
const DEFAULT_CAPTURE_READINESS_TIMEOUT_MS = 15000;
const DEFAULT_CAPTURE_READINESS_DELAY_MS = 500;

const TRANSIENT_CAPTURE_PATTERNS = [
  /uiautomation not connected/i,
  /already connected/i,
  /\bunavailable\b/i,
  /no connection established/i,
  /empty screenshot/i,
  /missing hierarchy/i,
  /invalid hierarchy/i,
  // Deep inside the Android driver, a stale UiAutomation binding can surface
  // as a JVM NPE from framework code (`getClass()` on a null field) rather
  // than the clean "UiAutomation not connected" string. Treat both shapes as
  // transient so the readiness window gets to retry instead of bailing on
  // the first poll.
  /null object reference/i,
  /nullpointerexception/i,
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
  const startedAt = performance.now();
  let lastMessage: string | null = null;
  let attempt = 0;

  while (performance.now() - startedAt < timeoutMs) {
    attempt += 1;
    const captureAttempt = await captureScreenshotPayload(grpcClient, 'debug', {
      phase: 'capture-readiness',
      attempt,
    });
    if (captureAttempt.success) {
      Logger.d(
        `ScreenshotCaptureHelper[capture-readiness attempt ${attempt}]: driver is ready for screenshot capture`,
      );
      return { ready: true, message: null };
    }

    lastMessage = captureAttempt.message;
    Logger.d(
      `ScreenshotCaptureHelper[capture-readiness attempt ${attempt}]: capture not ready transient=${captureAttempt.transient} reason=${captureAttempt.message ?? 'unknown error'}`,
    );
    if (!captureAttempt.transient) {
      return { ready: false, message: captureAttempt.message };
    }

    await delay(delayMs);
  }

  Logger.d(
    `ScreenshotCaptureHelper[capture-readiness]: timed out after ${attempt} attempts over ${roundDuration(timeoutMs)}ms`,
  );
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

  async capture(traceStep?: number | null): Promise<DeviceNodeResponse> {
    const totalStartedAt = performance.now();
    logCaptureDetail(
      {
        phase: 'capture.total',
        traceStep,
      },
      `requested shouldEnsureStability=${this._session.shouldEnsureStability}`,
    );

    let stabilityResult: StabilityWaitResult = {
      stable: false,
      durationMs: 0,
      pollCount: 0,
    };

    if (this._session.shouldEnsureStability) {
      stabilityResult = await this._waitForStableScreen(traceStep);
    }

    const finalAttempt = await this._captureWithRetry(
      SCREENSHOT_CAPTURE_RETRY_ATTEMPTS,
      traceStep,
    );
    const captureTrace: CaptureTraceMetadata = {
      totalMs: roundDuration(performance.now() - totalStartedAt),
      stabilityMs:
        this._session.shouldEnsureStability ? stabilityResult.durationMs : undefined,
      finalPayloadMs: finalAttempt.durationMs,
      stable: stabilityResult.stable,
      pollCount: stabilityResult.pollCount,
      attempts: finalAttempt.attempts,
      failureReason: finalAttempt.success ? undefined : finalAttempt.message ?? undefined,
    };

    return this._toResponse(finalAttempt, captureTrace);
  }

  private async _captureWithRetry(
    maxAttempts: number,
    traceStep?: number | null,
  ): Promise<CaptureAttemptResult> {
    const phase = startTracePhase(
      traceStep,
      'capture.final_payload',
      `maxAttempts=${maxAttempts}`,
    );
    const startedAt = performance.now();
    let lastAttempt: CaptureAttemptResult = {
      success: false,
      transient: false,
      message: 'Screenshot capture failed before any attempts were made',
      durationMs: 0,
      attempts: 0,
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      logCaptureDetail(
        {
          phase: 'capture.final_payload',
          traceStep,
          attempt,
          totalAttempts: maxAttempts,
        },
        'requesting screenshot + hierarchy',
      );

      lastAttempt = await captureScreenshotPayload(
        this._grpcClient,
        attempt < maxAttempts ? 'debug' : 'error',
        {
          phase: 'capture.final_payload',
          traceStep,
          attempt,
          totalAttempts: maxAttempts,
        },
      );

      if (lastAttempt.success || !lastAttempt.transient || attempt === maxAttempts) {
        lastAttempt = {
          ...lastAttempt,
          attempts: attempt,
          durationMs: roundDuration(performance.now() - startedAt),
        };

        finishTracePhase(
          phase,
          lastAttempt.success ? 'success' : 'failure',
          `attempts=${attempt} transient=${lastAttempt.transient}${lastAttempt.message ? ` reason=${lastAttempt.message}` : ''}`,
        );
        return lastAttempt;
      }

      logCaptureDetail(
        {
          phase: 'capture.final_payload',
          traceStep,
          attempt,
          totalAttempts: maxAttempts,
        },
        `transient failure, retrying in ${SCREENSHOT_CAPTURE_RETRY_DELAY_MS}ms`,
      );
      await delay(SCREENSHOT_CAPTURE_RETRY_DELAY_MS);
    }

    lastAttempt = {
      ...lastAttempt,
      durationMs: roundDuration(performance.now() - startedAt),
    };
    finishTracePhase(
      phase,
      'failure',
      lastAttempt.message ?? 'unknown capture failure',
    );
    return lastAttempt;
  }

  private async _waitForStableScreen(
    traceStep?: number | null,
  ): Promise<StabilityWaitResult> {
    const phase = startTracePhase(traceStep, 'capture.stability');
    const startedAt = performance.now();
    let previousHash: string | null = null;
    let pollCount = 0;

    while (performance.now() - startedAt < SCREENSHOT_STABILITY_TIMEOUT_MS) {
      pollCount += 1;
      const rawFetchStartedAt = performance.now();
      const response = await this._getRawScreenshot(traceStep);
      const fetchDurationMs = roundDuration(performance.now() - rawFetchStartedAt);
      const compareStartedAt = performance.now();
      const currentHash = hashRawScreenshot(response);
      const comparisonDurationMs = roundDuration(
        performance.now() - compareStartedAt,
      );
      const elapsedMs = roundDuration(performance.now() - startedAt);

      if (currentHash && currentHash === previousHash) {
        finishTracePhase(
          phase,
          'success',
          `polls=${pollCount} hash=${shortHash(currentHash)}`,
        );
        logCaptureDetail(
          {
            phase: 'capture.stability',
            traceStep,
          },
          `poll=${pollCount} state=stable hash=${shortHash(currentHash)} elapsed=${elapsedMs}ms fetch=${fetchDurationMs}ms compare=${comparisonDurationMs}ms`,
        );
        return {
          stable: true,
          durationMs: elapsedMs,
          pollCount,
        };
      }

      if (!currentHash) {
        logCaptureDetail(
          {
            phase: 'capture.stability',
            traceStep,
          },
          `poll=${pollCount} state=empty elapsed=${elapsedMs}ms fetch=${fetchDurationMs}ms compare=${comparisonDurationMs}ms`,
        );
      } else if (!previousHash) {
        logCaptureDetail(
          {
            phase: 'capture.stability',
            traceStep,
          },
          `poll=${pollCount} state=baseline hash=${shortHash(currentHash)} elapsed=${elapsedMs}ms fetch=${fetchDurationMs}ms compare=${comparisonDurationMs}ms`,
        );
      } else {
        logCaptureDetail(
          {
            phase: 'capture.stability',
            traceStep,
          },
          `poll=${pollCount} state=changed previous=${shortHash(previousHash)} current=${shortHash(currentHash)} elapsed=${elapsedMs}ms fetch=${fetchDurationMs}ms compare=${comparisonDurationMs}ms`,
        );
      }

      previousHash = currentHash;
      await delay(SCREENSHOT_STABILITY_POLL_DELAY_MS);
    }

    const durationMs = roundDuration(performance.now() - startedAt);
    finishTracePhase(
      phase,
      'failure',
      `timeout=${SCREENSHOT_STABILITY_TIMEOUT_MS}ms polls=${pollCount}`,
    );
    return {
      stable: false,
      durationMs,
      pollCount,
    };
  }

  private async _getRawScreenshot(
    traceStep?: number | null,
  ): Promise<GrpcRawScreenshotResponse | null> {
    try {
      const response = await this._grpcClient.getRawScreenshot(undefined, {
        errorLogLevel: 'debug',
      });

      if (!response.success || !response.screenshot || response.screenshot.length === 0) {
        logCaptureDetail(
          {
            phase: 'capture.stability',
            traceStep,
          },
          `raw screenshot invalid success=${response.success} bytes=${response.screenshot?.length ?? 0} message=${response.message ?? 'none'}`,
        );
        return null;
      }

      logCaptureDetail(
        {
          phase: 'capture.stability',
          traceStep,
        },
        `raw screenshot received bytes=${response.screenshot.length} screen=${response.screenWidth}x${response.screenHeight}`,
      );
      return response;
    } catch (error) {
      logCaptureDetail(
        {
          phase: 'capture.stability',
          traceStep,
        },
        `raw screenshot request failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private _toResponse(
    attempt: CaptureAttemptResult,
    captureTrace: CaptureTraceMetadata,
  ): DeviceNodeResponse {
    return new DeviceNodeResponse({
      success: attempt.success,
      message: attempt.message,
      data: {
        ...(attempt.data ?? {}),
        captureTrace,
      },
    });
  }
}

async function captureScreenshotPayload(
  grpcClient: GrpcDriverClient,
  errorLogLevel: 'error' | 'debug' | 'silent',
  context?: CaptureLogContext,
): Promise<CaptureAttemptResult> {
  const startedAt = performance.now();

  try {
    const response = await grpcClient.getScreenshotAndHierarchy(undefined, {
      errorLogLevel,
    });
    logCaptureDetail(
      context,
      `driver response success=${response.success} screenshotChars=${response.screenshot?.length ?? 0} hierarchyChars=${response.hierarchy?.length ?? 0} screen=${response.screenWidth}x${response.screenHeight} message=${response.message ?? 'none'}`,
    );

    const validation = validateScreenshotCaptureResponse(response);
    if (!validation.valid) {
      logCaptureDetail(
        context,
        `invalid payload transient=${validation.transient} reason=${validation.message ?? 'unknown validation failure'}`,
      );
      return {
        success: false,
        transient: validation.transient,
        message: validation.message,
        durationMs: roundDuration(performance.now() - startedAt),
        attempts: 1,
      };
    }

    logCaptureDetail(context, 'valid payload accepted');
    return {
      success: true,
      transient: false,
      message: null,
      durationMs: roundDuration(performance.now() - startedAt),
      attempts: 1,
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
    logCaptureDetail(
      context,
      `request failed transient=${isTransientCaptureFailureMessage(message)} reason=${message}`,
    );
    return {
      success: false,
      transient: isTransientCaptureFailureMessage(message),
      message,
      durationMs: roundDuration(performance.now() - startedAt),
      attempts: 1,
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

function roundDuration(durationMs: number): number {
  return Math.max(0, Math.round(durationMs));
}

function shortHash(value: string): string {
  return value.slice(0, 8);
}

function startTracePhase(
  traceStep: number | null | undefined,
  phase: string,
  detail?: string,
): ActiveCapturePhase | null {
  if (traceStep !== undefined && traceStep !== null) {
    Logger.d(`[trace step=${traceStep} phase=${phase}] start${formatDetail(detail)}`);
  }

  return traceStep !== undefined && traceStep !== null
    ? {
        traceStep,
        phase,
        startedAt: performance.now(),
      }
    : null;
}

function finishTracePhase(
  activePhase: ActiveCapturePhase | null,
  status: TraceStatus,
  detail?: string,
): number {
  const durationMs = activePhase === null
    ? 0
    : roundDuration(performance.now() - activePhase.startedAt);

  if (activePhase !== null) {
    Logger.d(
      `[trace step=${activePhase.traceStep} phase=${activePhase.phase}] done duration=${durationMs}ms status=${status}${formatDetail(detail)}`,
    );
  }

  return durationMs;
}

function logCaptureDetail(
  context: CaptureLogContext | undefined,
  message: string,
): void {
  if (context?.traceStep !== undefined && context.traceStep !== null) {
    const attemptPart =
      context.attempt !== undefined
        ? context.totalAttempts !== undefined
          ? ` attempt=${context.attempt}/${context.totalAttempts}`
          : ` attempt=${context.attempt}`
        : '';
    Logger.d(
      `[trace step=${context.traceStep} phase=${context.phase}]${attemptPart} ${message}`,
    );
    return;
  }

  const contextLabel = formatCaptureContext(context);
  Logger.d(`ScreenshotCaptureHelper[${contextLabel}]: ${message}`);
}

function formatCaptureContext(context?: CaptureLogContext): string {
  if (!context) {
    return 'capture';
  }

  if (context.totalAttempts !== undefined && context.attempt !== undefined) {
    return `${context.phase} attempt ${context.attempt}/${context.totalAttempts}`;
  }

  if (context.attempt !== undefined) {
    return `${context.phase} attempt ${context.attempt}`;
  }

  return context.phase;
}

function formatDetail(detail: string | undefined): string {
  if (!detail) {
    return '';
  }

  return ` detail=${JSON.stringify(detail.replace(/\s+/g, ' ').trim())}`;
}
