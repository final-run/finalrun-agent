// Port of common/model/DeviceNodeResponse.dart

/**
 * Response wrapper from device operations (gRPC → Device → Agent).
 *
 * Dart equivalent: common/model/DeviceNodeResponse.dart
 */
export class DeviceNodeResponse {
  readonly success: boolean;
  readonly message: string | null;
  readonly data: Record<string, unknown> | null;

  constructor(params: {
    success: boolean;
    message?: string | null;
    data?: Record<string, unknown> | null;
  }) {
    this.success = params.success;
    this.message = params.message ?? null;
    this.data = params.data ?? null;
  }

  static fromJson(json: Record<string, unknown>): DeviceNodeResponse {
    return new DeviceNodeResponse({
      success: json['success'] as boolean,
      message: (json['message'] as string) ?? null,
      data: (json['data'] as Record<string, unknown>) ?? null,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      success: this.success,
      message: this.message,
      data: this.data,
    };
  }
}
