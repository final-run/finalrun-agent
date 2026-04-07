export class LogInfo {
  readonly deviceId: string;
  readonly filePath: string;
  readonly runId: string;
  readonly testId: string;
  readonly platform: string;
  readonly startTime: Date;
  endTime: Date | null;

  constructor(params: {
    deviceId: string;
    filePath: string;
    runId: string;
    testId: string;
    platform: string;
  }) {
    this.deviceId = params.deviceId;
    this.filePath = params.filePath;
    this.runId = params.runId;
    this.testId = params.testId;
    this.platform = params.platform;
    this.startTime = new Date();
    this.endTime = null;
  }

  markAsEnded(): void {
    this.endTime = new Date();
  }
}
