import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import {
  type BindingReferenceRecord,
  type FailurePhase,
  Logger,
  type LoadedRepoTestSpec,
  type LoadedRepoTestSuite,
  type LogEntry,
  type LoggerSink,
  type RunManifestAppRecord,
  type RunManifestCliRecord,
  type RunManifestEnvironmentRecord,
  type RunManifestFirstFailureRecord,
  type RunManifestModelRecord,
  type RunManifestRecord,
  type RunManifestSelectedSpecRecord,
  type RunManifestSpecRecord,
  type RunManifestSuiteRecord,
  type RunManifestStepRecord,
  type RunArtifactStatus,
  type RunTargetRecord,
  type RunSummaryRecord,
  type RuntimeBindings,
  type SpecArtifactStatus,
  type SpecArtifactRecord,
  type StepArtifactRecord,
  redactResolvedValue,
} from '@finalrun/common';
import type { GoalResult, StepResult } from '@finalrun/goal-executor';
import type { LoadedEnvironmentConfig } from './specLoader.js';

interface SpecSnapshotState {
  authored: {
    name: string;
    description?: string;
    setup: string[];
    steps: string[];
    assertions: string[];
  };
  bindingReferences: BindingReferenceRecord;
  snapshotYamlPath: string;
  snapshotJsonPath: string;
  workspaceSourcePath: string;
  effectiveGoal: string;
}

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
  private _inputEnvironment: RunManifestEnvironmentRecord;
  private _inputSuite?: RunManifestSuiteRecord;
  private _inputSpecs: RunManifestSelectedSpecRecord[] = [];
  private readonly _specSnapshots = new Map<string, SpecSnapshotState>();
  private _cliContext: RunManifestCliRecord = {
    command: 'finalrun test',
    selectors: [],
    debug: false,
  };
  private _runTarget: RunTargetRecord = {
    type: 'direct',
  };
  private _modelContext: RunManifestModelRecord = {
    provider: 'unknown',
    modelName: 'unknown',
    label: 'unknown/unknown',
  };
  private _appContext: RunManifestAppRecord = {
    source: 'repo',
    label: 'repo app',
  };
  private _runContextJsonPath?: string;

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
    this._inputEnvironment = {
      envName: params.envName,
      variables: params.bindings.variables,
      secretReferences: [],
    };
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

  setRunContext(params: {
    cli: RunManifestCliRecord;
    model: RunManifestModelRecord;
    app: RunManifestAppRecord;
    target?: RunTargetRecord;
  }): void {
    this._cliContext = params.cli;
    this._modelContext = params.model;
    this._appContext = params.app;
    this._runTarget = params.target ?? { type: 'direct' };
  }

  async writeRunInputs(params: {
    workspaceRoot: string;
    environment: LoadedEnvironmentConfig;
    specs: LoadedRepoTestSpec[];
    suite?: LoadedRepoTestSuite;
    effectiveGoals: Map<string, string>;
    target: RunTargetRecord;
    cli: RunManifestCliRecord;
    model: RunManifestModelRecord;
    app: RunManifestAppRecord;
  }): Promise<void> {
    const inputDir = path.join(this._runDir, 'input');
    const specSnapshotDir = path.join(inputDir, 'specs');
    await fsp.mkdir(specSnapshotDir, { recursive: true });

    this.setRunContext({
      cli: params.cli,
      model: params.model,
      app: params.app,
      target: params.target,
    });
    this._runContextJsonPath = path.posix.join('input', 'run-context.json');
    await fsp.writeFile(
      path.join(this._runDir, this._runContextJsonPath),
      JSON.stringify(
        {
          cli: params.cli,
          model: params.model,
          app: params.app,
          target: params.target,
        },
        null,
        2,
      ),
      'utf-8',
    );

    const envSnapshotYamlPath = path.posix.join('input', 'env.snapshot.yaml');
    const envSnapshotJsonPath = path.posix.join('input', 'env.json');
    const workspaceEnvPath = params.environment.envPath
      ? toDisplayPath(params.workspaceRoot, params.environment.envPath)
      : undefined;
    this._inputEnvironment = {
      envName: params.environment.envName,
      workspaceEnvPath,
      snapshotYamlPath: envSnapshotYamlPath,
      snapshotJsonPath: envSnapshotJsonPath,
      variables: params.environment.config.variables,
      secretReferences: params.environment.secretReferences,
    };
    await fsp.writeFile(
      path.join(this._runDir, envSnapshotYamlPath),
      YAML.stringify({
        secrets: params.environment.config.secrets,
        variables: params.environment.config.variables,
      }),
      'utf-8',
    );
    await fsp.writeFile(
      path.join(this._runDir, envSnapshotJsonPath),
      JSON.stringify(this._inputEnvironment, null, 2),
      'utf-8',
    );

    this._inputSuite = undefined;
    if (params.suite) {
      const suiteSnapshotYamlPath = path.posix.join('input', 'suite.snapshot.yaml');
      const suiteSnapshotJsonPath = path.posix.join('input', 'suite.json');
      const suiteRecord: RunManifestSuiteRecord = {
        suiteId: params.suite.suiteId,
        suiteName: params.suite.name,
        description: params.suite.description,
        workspaceSourcePath: toDisplayPath(params.workspaceRoot, params.suite.sourcePath),
        snapshotYamlPath: suiteSnapshotYamlPath,
        snapshotJsonPath: suiteSnapshotJsonPath,
        tests: params.suite.tests,
        resolvedSpecIds: params.specs.map((spec) => spec.specId),
      };
      await fsp.copyFile(
        params.suite.sourcePath,
        path.join(this._runDir, suiteSnapshotYamlPath),
      );
      await fsp.writeFile(
        path.join(this._runDir, suiteSnapshotJsonPath),
        JSON.stringify(suiteRecord, null, 2),
        'utf-8',
      );
      this._inputSuite = suiteRecord;
    }

    const selectedSpecs: RunManifestSelectedSpecRecord[] = [];
    this._specSnapshots.clear();
    for (const spec of params.specs) {
      const snapshotYamlPath = path.posix.join('input', 'specs', `${spec.specId}.yaml`);
      const snapshotJsonPath = path.posix.join('input', 'specs', `${spec.specId}.json`);
      const bindingReferences = collectBindingReferences(spec);
      const authored = {
        name: spec.name,
        description: spec.description,
        setup: spec.setup,
        steps: spec.steps,
        assertions: spec.assertions,
      };
      const workspaceSourcePath = toDisplayPath(params.workspaceRoot, spec.sourcePath);
      const effectiveGoal = params.effectiveGoals.get(spec.specId) ?? '';
      await fsp.copyFile(spec.sourcePath, path.join(this._runDir, snapshotYamlPath));
      await fsp.writeFile(
        path.join(this._runDir, snapshotJsonPath),
        JSON.stringify(
          {
            specId: spec.specId,
            specName: spec.name,
            relativePath: spec.relativePath,
            workspaceSourcePath,
            bindingReferences,
            ...authored,
          },
          null,
          2,
        ),
        'utf-8',
      );
      this._specSnapshots.set(spec.specId, {
        authored,
        bindingReferences,
        snapshotYamlPath,
        snapshotJsonPath,
        workspaceSourcePath,
        effectiveGoal,
      });
      selectedSpecs.push({
        specId: spec.specId,
        specName: spec.name,
        relativePath: spec.relativePath,
        workspaceSourcePath,
        snapshotYamlPath,
        snapshotJsonPath,
        bindingReferences,
      });
    }

    this._inputSpecs = selectedSpecs;
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
      status: resolveSpecArtifactStatus(result),
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
    statusOverride?: RunArtifactStatus;
    failurePhase?: FailurePhase;
    diagnosticsSummary?: string;
  }): Promise<RunSummaryRecord> {
    const passedCount = params.specs.filter((spec) => spec.success).length;
    const failedCount = params.specs.length - passedCount;
    const stepCount = params.specs.reduce((total, spec) => total + spec.steps.length, 0);
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
      status: params.statusOverride ?? ((params.successOverride ?? failedCount === 0) ? 'success' : 'failure'),
      failurePhase: params.failurePhase,
      specCount: params.specs.length,
      passedCount,
      failedCount,
      stepCount,
      target: this._runTarget,
      variables: this._bindings.variables,
      tests: params.specs.map((spec) => ({
        specId: spec.specId,
        specName: spec.specName,
        relativePath: spec.relativePath,
        success: spec.success,
        status: spec.status,
        durationMs: spec.durationMs,
        resultFile: path.posix.join('tests', spec.specId, 'result.json'),
      })),
      runJsonFile: 'run.json',
    };
    const manifest = this._buildRunManifest({
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      specs: params.specs,
      success: summary.success,
      status: summary.status,
      failurePhase: params.failurePhase,
      diagnosticsSummary: params.diagnosticsSummary,
    });

    await fsp.writeFile(
      path.join(this._runDir, 'summary.json'),
      JSON.stringify(summary, null, 2),
      'utf-8',
    );
    await fsp.writeFile(
      path.join(this._runDir, 'run.json'),
      JSON.stringify(manifest, null, 2),
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
      status: 'error',
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

  private _buildRunManifest(params: {
    startedAt: string;
    completedAt: string;
    specs: SpecArtifactRecord[];
    success: boolean;
    status: RunArtifactStatus;
    failurePhase?: FailurePhase;
    diagnosticsSummary?: string;
  }): RunManifestRecord {
    const specRecords = params.specs.map((spec) => this._toRunManifestSpec(spec));
    const stepTotal = specRecords.reduce(
      (total, spec) => total + spec.counts.executionStepsTotal,
      0,
    );
    const stepPassed = specRecords.reduce(
      (total, spec) => total + spec.counts.executionStepsPassed,
      0,
    );
    const firstFailure = findRunFirstFailure(specRecords, params.diagnosticsSummary);
    return {
      schemaVersion: 1,
      run: {
        runId: this._runId,
        success: params.success,
        status: params.status,
        failurePhase: params.failurePhase,
        startedAt: params.startedAt,
        completedAt: params.completedAt,
        durationMs: Math.max(
          0,
          new Date(params.completedAt).getTime() - new Date(params.startedAt).getTime(),
        ),
        envName: this._envName,
        platform: this._platform,
        model: this._modelContext,
        app: this._appContext,
        selectors: this._cliContext.selectors,
        target: this._runTarget,
        counts: {
          specs: {
            total: specRecords.length,
            passed: specRecords.filter((spec) => spec.success).length,
            failed: specRecords.filter((spec) => !spec.success).length,
          },
          steps: {
            total: stepTotal,
            passed: stepPassed,
            failed: stepTotal - stepPassed,
          },
        },
        firstFailure,
        diagnosticsSummary: params.diagnosticsSummary,
      },
      input: {
        environment: this._inputEnvironment,
        suite: this._inputSuite,
        specs: this._inputSpecs,
        cli: this._cliContext,
      },
      specs: specRecords,
      paths: {
        runJson: 'run.json',
        summaryJson: 'summary.json',
        log: 'runner.log',
        runContextJson: this._runContextJsonPath,
      },
    };
  }

  private _toRunManifestSpec(spec: SpecArtifactRecord): RunManifestSpecRecord {
    const snapshot = this._specSnapshots.get(spec.specId);
    const steps = spec.steps.map((step) => ({ ...step })) as RunManifestStepRecord[];
    const passedSteps = steps.filter((step) => step.success).length;
    const firstFailureStep = steps.find((step) => !step.success);
    const firstFailure = firstFailureStep
      ? {
          specId: spec.specId,
          specName: spec.specName,
          stepNumber: firstFailureStep.stepNumber,
          actionType: firstFailureStep.actionType,
          message:
            firstFailureStep.errorMessage ??
            firstFailureStep.trace?.failureReason ??
            spec.message,
          screenshotPath: firstFailureStep.screenshotFile,
          stepJsonPath: firstFailureStep.stepJsonFile,
        }
      : undefined;

    return {
      ...spec,
      workspaceSourcePath: snapshot?.workspaceSourcePath ?? spec.sourcePath,
      snapshotYamlPath: snapshot?.snapshotYamlPath ?? '',
      snapshotJsonPath: snapshot?.snapshotJsonPath ?? '',
      bindingReferences: snapshot?.bindingReferences ?? { variables: [], secrets: [] },
      authored: snapshot?.authored ?? {
        name: spec.specName,
        setup: [],
        steps: [],
        assertions: [],
      },
      effectiveGoal: snapshot?.effectiveGoal ?? '',
      counts: {
        executionStepsTotal: steps.length,
        executionStepsPassed: passedSteps,
        executionStepsFailed: steps.length - passedSteps,
      },
      firstFailure,
      previewScreenshotPath: selectPreviewScreenshotPath(steps),
      resultJsonPath: path.posix.join('tests', spec.specId, 'result.json'),
      steps,
    };
  }

  private async _copyRecordingArtifact(
    specId: string,
    recording: GoalResult['recording'],
  ): Promise<string | undefined> {
    if (!recording?.filePath) {
      return undefined;
    }

    const ext = path.extname(recording.filePath) || '.mov';
    const recordingRelative = path.posix.join('tests', specId, `recording${ext}`);
    const sourcePath = path.resolve(recording.filePath);
    const targetPath = path.resolve(path.join(this._runDir, recordingRelative));

    try {
      await fsp.access(sourcePath);
    } catch {
      Logger.w(`Recording file not found for report copy: ${recording.filePath}`);
      return undefined;
    }

    if (sourcePath === targetPath) {
      return recordingRelative;
    }

    await fsp.copyFile(sourcePath, targetPath);
    return recordingRelative;
  }
}

function resolveSpecArtifactStatus(result: GoalResult): SpecArtifactStatus {
  if (result.status === 'aborted') {
    return 'aborted';
  }
  return result.success ? 'success' : 'failure';
}

function collectBindingReferences(spec: LoadedRepoTestSpec): BindingReferenceRecord {
  const variables = new Set<string>();
  const secrets = new Set<string>();
  const values = [
    spec.name,
    spec.description,
    ...spec.setup,
    ...spec.steps,
    ...spec.assertions,
  ].filter((value): value is string => typeof value === 'string');

  for (const value of values) {
    for (const match of value.matchAll(/\$\{(variables|secrets)\.([A-Za-z0-9_-]+)\}/g)) {
      const namespace = match[1];
      const key = match[2];
      if (namespace === 'variables') {
        variables.add(key);
      } else if (namespace === 'secrets') {
        secrets.add(key);
      }
    }
  }

  return {
    variables: Array.from(variables.values()).sort((left, right) => left.localeCompare(right)),
    secrets: Array.from(secrets.values()).sort((left, right) => left.localeCompare(right)),
  };
}

function toDisplayPath(rootDir: string, filePath: string): string {
  const relative = path.relative(rootDir, filePath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return filePath.split(path.sep).join('/');
}

function selectPreviewScreenshotPath(
  steps: StepArtifactRecord[],
): string | undefined {
  const failedScreenshot = steps.find((step) => !step.success && step.screenshotFile);
  if (failedScreenshot?.screenshotFile) {
    return failedScreenshot.screenshotFile;
  }
  return steps.find((step) => step.screenshotFile)?.screenshotFile;
}

function findRunFirstFailure(
  specs: RunManifestSpecRecord[],
  diagnosticsSummary?: string,
): RunManifestFirstFailureRecord | undefined {
  const failedSpec = specs.find((spec) => !spec.success);
  if (failedSpec?.firstFailure) {
    return failedSpec.firstFailure;
  }
  if (failedSpec) {
    return {
      specId: failedSpec.specId,
      specName: failedSpec.specName,
      message: failedSpec.message,
      screenshotPath: failedSpec.previewScreenshotPath,
    };
  }
  if (diagnosticsSummary) {
    return { message: diagnosticsSummary };
  }
  return undefined;
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
