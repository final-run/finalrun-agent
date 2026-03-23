import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  Logger,
  type LoadedRepoTestSpec,
  type LogEntry,
  type LoggerSink,
  type RunSummaryRecord,
  type RuntimeBindings,
  type SpecArtifactRecord,
  type StepArtifactRecord,
  redactResolvedValue,
} from '@finalrun/common';
import type { GoalResult, StepResult } from '@finalrun/goal-executor';
import { renderHtmlReport } from './reportTemplate.js';

export class ReportWriter {
  private static readonly _FAILURE_PLACEHOLDER_IMAGE = Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEA8QDw8PDw8PDw8PDw8QDxAQFREWFhURFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGxAQGy0fICUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAgMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB5A//xAAXEAEBAQEAAAAAAAAAAAAAAAABABEh/9oACAEBAAEFAm3H/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPwGn/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPwGn/9k=',
    'base64',
  );
  private readonly _runDir: string;
  private readonly _envName: string;
  private readonly _platform: string;
  private readonly _runId: string;
  private readonly _bindings: RuntimeBindings;
  private readonly _runnerLogPath: string;

  constructor(params: {
    runDir: string;
    envName: string;
    platform: string;
    runId: string;
    bindings: RuntimeBindings;
  }) {
    this._runDir = params.runDir;
    this._envName = params.envName;
    this._platform = params.platform;
    this._runId = params.runId;
    this._bindings = params.bindings;
    this._runnerLogPath = path.join(this._runDir, 'runner.log');
  }

  async init(): Promise<void> {
    await fsp.mkdir(this._runDir, { recursive: true });
    await fsp.writeFile(this._runnerLogPath, '', 'utf-8');
  }

  createLoggerSink(): LoggerSink {
    return (entry: LogEntry) => {
      const renderedMessage =
        redactResolvedValue(entry.renderedMessage, this._bindings) ?? entry.renderedMessage;
      fs.appendFileSync(
        this._runnerLogPath,
        `${entry.timestamp} ${renderedMessage}\n`,
        'utf-8',
      );
    };
  }

  appendLogLine(line: string): void {
    const renderedLine = redactResolvedValue(line, this._bindings) ?? line;
    fs.appendFileSync(
      this._runnerLogPath,
      `${new Date().toISOString()} ${renderedLine}\n`,
      'utf-8',
    );
  }

  appendRawBlock(block: string): void {
    const renderedBlock = redactResolvedValue(block, this._bindings) ?? block;
    fs.appendFileSync(
      this._runnerLogPath,
      renderedBlock.endsWith('\n') ? renderedBlock : `${renderedBlock}\n`,
      'utf-8',
    );
  }

  async writeSpecRecord(
    spec: LoadedRepoTestSpec,
    result: GoalResult,
    bindings: RuntimeBindings,
  ): Promise<SpecArtifactRecord> {
    const specDir = path.join(this._runDir, 'tests', spec.specId);
    const stepDir = path.join(specDir, 'steps');
    const screenshotDir = path.join(specDir, 'screenshots');
    await fsp.mkdir(stepDir, { recursive: true });
    await fsp.mkdir(screenshotDir, { recursive: true });

    const recordingRelative = await this._copyRecordingArtifact(spec.specId, result.recording);
    const recordingStartedAt = result.recording?.startedAt;
    const recordingCompletedAt = result.recording?.completedAt;

    const steps: StepArtifactRecord[] = [];
    for (const [index, step] of result.steps.entries()) {
      const stepNumber = index + 1;
      const stepFileBase = `${String(stepNumber).padStart(3, '0')}`;
      const stepJsonRelative = path.posix.join('tests', spec.specId, 'steps', `${stepFileBase}.json`);
      const screenshotRelative = step.screenshot
        ? path.posix.join('tests', spec.specId, 'screenshots', `${stepFileBase}.jpg`)
        : undefined;

      if (step.screenshot && screenshotRelative) {
        const buffer = decodeScreenshot(step.screenshot);
        await fsp.writeFile(path.join(this._runDir, screenshotRelative), buffer);
      }

      const artifactStep = toStepArtifactRecord(step, {
        stepNumber,
        bindings,
        screenshotFile: screenshotRelative,
        videoOffsetMs: computeVideoOffsetMs(step.timestamp, recordingStartedAt),
        stepJsonFile: stepJsonRelative,
      });
      steps.push(artifactStep);
      await fsp.writeFile(
        path.join(this._runDir, stepJsonRelative),
        JSON.stringify(artifactStep, null, 2),
        'utf-8',
      );
    }

    const specRecord: SpecArtifactRecord = {
      specId: spec.specId,
      specName: spec.name,
      sourcePath: spec.sourcePath,
      relativePath: spec.relativePath,
      success: result.success,
      message: redactResolvedValue(result.message, bindings) ?? result.message,
      analysis: redactResolvedValue(result.analysis, bindings),
      platform: result.platform,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      durationMs: Math.max(
        0,
        new Date(result.completedAt).getTime() - new Date(result.startedAt).getTime(),
      ),
      recordingFile: recordingRelative,
      recordingStartedAt,
      recordingCompletedAt,
      steps,
    };

    await fsp.writeFile(
      path.join(specDir, 'result.json'),
      JSON.stringify(specRecord, null, 2),
      'utf-8',
    );

    return specRecord;
  }

  async finalize(params: {
    startedAt: string;
    completedAt: string;
    specs: SpecArtifactRecord[];
    successOverride?: boolean;
  }): Promise<RunSummaryRecord> {
    const passedCount = params.specs.filter((spec) => spec.success).length;
    const failedCount = params.specs.length - passedCount;
    const summary: RunSummaryRecord = {
      runId: this._runId,
      envName: this._envName,
      platform: this._platform,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs: Math.max(
        0,
        new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime(),
      ),
      success: params.successOverride ?? failedCount === 0,
      specCount: params.specs.length,
      passedCount,
      failedCount,
      variables: this._bindings.variables,
      tests: params.specs.map((spec) => ({
        specId: spec.specId,
        specName: spec.specName,
        relativePath: spec.relativePath,
        success: spec.success,
        durationMs: spec.durationMs,
        resultFile: path.posix.join('tests', spec.specId, 'result.json'),
      })),
    };

    await fsp.writeFile(
      path.join(this._runDir, 'summary.json'),
      JSON.stringify(summary, null, 2),
      'utf-8',
    );
    await fsp.writeFile(
      path.join(this._runDir, 'index.html'),
      renderHtmlReport({ summary, specs: params.specs }),
      'utf-8',
    );

    return summary;
  }

  async writeSpecFailureRecord(params: {
    spec: LoadedRepoTestSpec;
    bindings: RuntimeBindings;
    message: string;
    platform: string;
    startedAt: string;
    completedAt: string;
  }): Promise<SpecArtifactRecord> {
    const specDir = path.join(this._runDir, 'tests', params.spec.specId);
    const stepDir = path.join(specDir, 'steps');
    const screenshotDir = path.join(specDir, 'screenshots');
    await fsp.mkdir(specDir, { recursive: true });
    await fsp.mkdir(stepDir, { recursive: true });
    await fsp.mkdir(screenshotDir, { recursive: true });

    const stepJsonRelative = path.posix.join('tests', params.spec.specId, 'steps', '001.json');
    const screenshotRelative = path.posix.join(
      'tests',
      params.spec.specId,
      'screenshots',
      '001.jpg',
    );
    const failureMessage =
      redactResolvedValue(params.message, params.bindings) ?? params.message;
    const failureStep: StepArtifactRecord = {
      stepNumber: 1,
      iteration: 1,
      actionType: 'run_failure',
      naturalLanguageAction: 'Run setup failed before the first recorded agent action.',
      reason: failureMessage,
      analysis: 'No executable agent step completed before the run failed.',
      success: false,
      status: 'failure',
      errorMessage: failureMessage,
      durationMs: Math.max(
        0,
        new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime(),
      ),
      timestamp: params.completedAt,
      screenshotFile: screenshotRelative,
      stepJsonFile: stepJsonRelative,
      trace: {
        step: 1,
        action: 'run_failure',
        status: 'failure',
        totalMs: Math.max(
          0,
          new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime(),
        ),
        spans: [],
        failureReason: failureMessage,
      },
    };

    await fsp.writeFile(
      path.join(this._runDir, screenshotRelative),
      ReportWriter._FAILURE_PLACEHOLDER_IMAGE,
    );
    await fsp.writeFile(
      path.join(this._runDir, stepJsonRelative),
      JSON.stringify(failureStep, null, 2),
      'utf-8',
    );

    const specRecord: SpecArtifactRecord = {
      specId: params.spec.specId,
      specName: params.spec.name,
      sourcePath: params.spec.sourcePath,
      relativePath: params.spec.relativePath,
      success: false,
      message: failureMessage,
      analysis: undefined,
      platform: params.platform,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs: Math.max(
        0,
        new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime(),
      ),
      steps: [failureStep],
    };

    await fsp.writeFile(
      path.join(specDir, 'result.json'),
      JSON.stringify(specRecord, null, 2),
      'utf-8',
    );

    return specRecord;
  }

  private async _copyRecordingArtifact(
    specId: string,
    recording: GoalResult['recording'],
  ): Promise<string | undefined> {
    if (!recording?.filePath) {
      return undefined;
    }

    try {
      await fsp.access(recording.filePath);
    } catch {
      Logger.w(`Recording file not found for report copy: ${recording.filePath}`);
      return undefined;
    }

    const ext = path.extname(recording.filePath) || '.mov';
    const recordingRelative = path.posix.join('tests', specId, `recording${ext}`);
    await fsp.copyFile(recording.filePath, path.join(this._runDir, recordingRelative));
    return recordingRelative;
  }
}

function toStepArtifactRecord(
  step: StepResult,
  params: {
    stepNumber: number;
    bindings: RuntimeBindings;
    screenshotFile?: string;
    videoOffsetMs?: number;
    stepJsonFile: string;
  },
): StepArtifactRecord & { stepJsonFile: string } {
  return {
    stepNumber: params.stepNumber,
    iteration: step.iteration,
    actionType: step.action,
    naturalLanguageAction: redactResolvedValue(
      step.naturalLanguageAction || step.reason,
      params.bindings,
    ) ?? step.naturalLanguageAction ?? step.reason,
    reason: redactResolvedValue(step.reason, params.bindings) ?? step.reason,
    analysis: redactResolvedValue(step.analysis, params.bindings),
    thought: step.thought
      ? {
          plan: redactResolvedValue(step.thought.plan, params.bindings),
          think: redactResolvedValue(step.thought.think, params.bindings),
          act: redactResolvedValue(step.thought.act, params.bindings),
        }
      : undefined,
    actionPayload: step.actionPayload
      ? {
          ...step.actionPayload,
          text: redactResolvedValue(step.actionPayload.text, params.bindings),
          url: redactResolvedValue(step.actionPayload.url, params.bindings),
        }
      : undefined,
    success: step.success,
    status: step.success ? 'success' : 'failure',
    errorMessage: redactResolvedValue(step.errorMessage, params.bindings),
    durationMs: step.durationMs,
    timestamp: step.timestamp ?? new Date().toISOString(),
    screenshotFile: params.screenshotFile,
    videoOffsetMs: params.videoOffsetMs,
    stepJsonFile: params.stepJsonFile,
    timing: redactTiming(step.timing, params.bindings),
    trace: redactTrace(step.trace, params.bindings),
  };
}

function computeVideoOffsetMs(
  stepTimestamp: string | undefined,
  recordingStartedAt: string | undefined,
): number | undefined {
  if (!stepTimestamp || !recordingStartedAt) {
    return undefined;
  }

  const stepTimeMs = new Date(stepTimestamp).getTime();
  const recordingStartMs = new Date(recordingStartedAt).getTime();
  if (!Number.isFinite(stepTimeMs) || !Number.isFinite(recordingStartMs)) {
    return undefined;
  }

  return Math.max(0, stepTimeMs - recordingStartMs);
}

function decodeScreenshot(value: string): Buffer {
  const normalized = value.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  try {
    const buffer = Buffer.from(normalized, 'base64');
    if (buffer.length > 0) {
      return buffer;
    }
  } catch {
    // Fall through to raw write below.
  }

  return Buffer.from(value, 'utf-8');
}

function redactTrace(
  trace: StepResult['trace'],
  bindings: RuntimeBindings,
): StepArtifactRecord['trace'] {
  if (!trace) {
    return undefined;
  }

  return {
    ...trace,
    failureReason: redactResolvedValue(trace.failureReason, bindings),
    spans: trace.spans.map((span) => ({
      ...span,
      detail: redactResolvedValue(span.detail, bindings),
    })),
  };
}

function redactTiming(
  timing: StepResult['timing'],
  bindings: RuntimeBindings,
): StepArtifactRecord['timing'] {
  if (!timing) {
    return undefined;
  }

  return {
    ...timing,
    spans: timing.spans.map((span) => ({
      ...span,
      detail: redactResolvedValue(span.detail, bindings),
    })),
  };
}
