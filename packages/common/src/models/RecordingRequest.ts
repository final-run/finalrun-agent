// Port of common/model/RecordingRequest.dart

/**
 * Request payload used to start a screen recording session.
 */
export class RecordingRequest {
  readonly testCaseId: string;
  readonly testRunId: string;
  readonly apiKey: string;
  readonly bitRate: string;
  readonly outputFilePath?: string;

  constructor(params: {
    testCaseId: string;
    testRunId: string;
    apiKey: string;
    bitRate?: string;
    outputFilePath?: string;
  }) {
    this.testCaseId = params.testCaseId;
    this.testRunId = params.testRunId;
    this.apiKey = params.apiKey;
    this.bitRate = params.bitRate ?? '1000000';
    this.outputFilePath = params.outputFilePath;
  }

  static fromJson(json: Record<string, unknown>): RecordingRequest {
    return new RecordingRequest({
      testCaseId: json['testCaseId'] as string,
      testRunId: json['testRunId'] as string,
      apiKey: json['apiKey'] as string,
      bitRate: (json['bitRate'] as string | undefined) ?? '1000000',
      outputFilePath: json['outputFilePath'] as string | undefined,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      testCaseId: this.testCaseId,
      testRunId: this.testRunId,
      apiKey: this.apiKey,
      bitRate: this.bitRate,
      outputFilePath: this.outputFilePath,
    };
  }
}
