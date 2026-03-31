export class RecordingInfo {
  readonly deviceId: string;
  readonly fileName: string;
  readonly filePath: string;
  readonly testRunId: string;
  readonly testCaseId: string;
  readonly platform: string;
  readonly apiKey: string;
  readonly startTime: Date;
  endTime: Date | null;

  constructor(params: {
    deviceId: string;
    fileName: string;
    filePath: string;
    testRunId: string;
    testCaseId: string;
    platform: string;
    apiKey: string;
  }) {
    this.deviceId = params.deviceId;
    this.fileName = params.fileName;
    this.filePath = params.filePath;
    this.testRunId = params.testRunId;
    this.testCaseId = params.testCaseId;
    this.platform = params.platform;
    this.apiKey = params.apiKey;
    this.startTime = new Date();
    this.endTime = null;
  }

  markAsEnded(): void {
    this.endTime = new Date();
  }
}
