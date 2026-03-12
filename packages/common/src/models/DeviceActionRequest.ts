// Port of common/model/DeviceActionRequest.dart

import { StepAction } from './TestStep.js';

/**
 * Wraps a StepAction for device execution, adding requestId and timeout.
 *
 * Dart equivalent: common/model/DeviceActionRequest.dart
 */
export class DeviceActionRequest {
  readonly requestId: string;
  readonly action: StepAction;
  readonly timeout: number;
  readonly shouldEnsureStability: boolean;

  constructor(params: {
    requestId: string;
    action: StepAction;
    timeout?: number;
    shouldEnsureStability?: boolean;
  }) {
    this.requestId = params.requestId;
    this.action = params.action;
    this.timeout = params.timeout ?? 30;
    this.shouldEnsureStability = params.shouldEnsureStability ?? true;
  }

  toJson(): Record<string, unknown> {
    return {
      requestId: this.requestId,
      action: this.action.toJson(),
      timeout: this.timeout,
      shouldEnsureStability: this.shouldEnsureStability,
    };
  }
}
