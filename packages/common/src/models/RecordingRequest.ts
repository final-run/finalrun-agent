// Port of common/model/RecordingRequest.dart

/**
 * Request payload used to start a screen recording session.
 */
export class RecordingRequest {
  readonly testId: string;
  readonly runId: string;
  readonly apiKey: string;
  readonly bitRate: string;
  readonly outputFilePath?: string;

  constructor(params: {
    testId: string;
    runId: string;
    apiKey: string;
    bitRate?: string;
    outputFilePath?: string;
  }) {
    this.testId = params.testId;
    this.runId = params.runId;
    this.apiKey = params.apiKey;
    this.bitRate = params.bitRate ?? '1000000';
    this.outputFilePath = params.outputFilePath;
  }

  static fromJson(json: Record<string, unknown>): RecordingRequest {
    return new RecordingRequest({
      testId: json['testId'] as string,
      runId: json['runId'] as string,
      apiKey: json['apiKey'] as string,
      bitRate: (json['bitRate'] as string | undefined) ?? '1000000',
      outputFilePath: json['outputFilePath'] as string | undefined,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      testId: this.testId,
      runId: this.runId,
      apiKey: this.apiKey,
      bitRate: this.bitRate,
      outputFilePath: this.outputFilePath,
    };
  }
}
