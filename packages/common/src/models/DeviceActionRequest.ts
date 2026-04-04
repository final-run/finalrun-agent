// Port of common/model/DeviceActionRequest.dart

import { DeviceAction } from './DeviceAction.js';

/**
 * Wraps a DeviceAction for device execution, adding requestId and timeout.
 *
 * Dart equivalent: common/model/DeviceActionRequest.dart
 */
export class DeviceActionRequest {
  readonly requestId: string;
  readonly action: DeviceAction;
  readonly timeout: number;
  readonly shouldEnsureStability: boolean;
  readonly traceStep: number | null;

  constructor(params: {
    requestId: string;
    action: DeviceAction;
    timeout?: number;
    shouldEnsureStability?: boolean;
    traceStep?: number | null;
  }) {
    this.requestId = params.requestId;
    this.action = params.action;
    this.timeout = params.timeout ?? 30;
    this.shouldEnsureStability = params.shouldEnsureStability ?? true;
    this.traceStep = params.traceStep ?? null;
  }

  toJson(): Record<string, unknown> {
    return {
      requestId: this.requestId,
      action: this.action.toJson(),
      timeout: this.timeout,
      shouldEnsureStability: this.shouldEnsureStability,
      traceStep: this.traceStep,
    };
  }
}
