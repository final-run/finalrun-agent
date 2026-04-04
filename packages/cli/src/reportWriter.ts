import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import {
  type BindingReference,
  type FailurePhase,
  Logger,
  type TestDefinition,
  type SuiteDefinition,
  type LogEntry,
  type LoggerSink,
  type RunManifestAppRecord,
  type EnvironmentRecord,
  type FirstFailure,
  type RunManifest,
  type TestResult,
  type AgentAction,
  type RunStatus,
  type TestStatus,
  type RunTarget,
  type RunSummary,
  type RuntimeBindings,
  redactResolvedValue,
} from '@finalrun/common';
import type { TestExecutionResult, AgentActionResult } from '@finalrun/goal-executor';
import type { LoadedEnvironmentConfig } from './testLoader.js';

interface TestSnapshotState {
  authored: {
    name: string;
    description?: string;
    setup: string[];
    steps: string[];
    assertions: string[];
  };
  bindingReferences: BindingReference;
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
  private _inputEnvironment: EnvironmentRecord;
  private _inputSuite?: SuiteDefinition;
  private _inputTests: TestDefinition[] = [];
  private readonly _testSnapshots = new Map<string, TestSnapshotState>();
  private _cliContext: {
    command: string;
    selectors: string[];
    debug: boolean;
  } = {
    command: 'finalrun test',
    selectors: [],
    debug: false,
  };
  private _runTarget: RunTarget = {
    type: 'direct',
  };
  private _modelContext: {
    provider: string;
    modelName: string;
    label: string;
  } = {
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
    cli: { command: string; selectors: string[]; debug: boolean; [key: string]: unknown };
    model: { provider: string; modelName: string; label: string };
    app: RunManifestAppRecord;
    target?: RunTarget;
  }): void {
    this._cliContext = params.cli;
    this._modelContext = params.model;
    this._appContext = params.app;
    this._runTarget = params.target ?? { type: 'direct' };
  }

  async writeRunInputs(params: {
    workspaceRoot: string;
    environment: LoadedEnvironmentConfig;
    specs: TestDefinition[];
    suite?: SuiteDefinition;
    effectiveGoals: Map<string, string>;
    target: RunTarget;
    cli: { command: string; selectors: string[]; debug: boolean; [key: string]: unknown };
    model: { provider: string; modelName: string; label: string };
    app: RunManifestAppRecord;
  }): Promise<void> {
    const inputDir = path.join(this._runDir, 'input');
    const specSnapshotDir = path.join(inputDir, 'tests');
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
      app: params.environment.config.app,
      variables: params.environment.config.variables,
      secretReferences: params.environment.secretReferences,
    };
    await fsp.writeFile(
      path.join(this._runDir, envSnapshotYamlPath),
      YAML.stringify({
        app: params.environment.config.app,
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
      const suiteRecord: SuiteDefinition = {
        suiteId: params.suite.suiteId,
        name: params.suite.name,
        description: params.suite.description,
        workspaceSourcePath: params.suite.sourcePath
          ? toDisplayPath(params.workspaceRoot, params.suite.sourcePath)
          : undefined,
        snapshotYamlPath: suiteSnapshotYamlPath,
        snapshotJsonPath: suiteSnapshotJsonPath,
        tests: params.suite.tests,
        resolvedTestIds: params.specs.map((spec) => spec.testId!),
      };
      if (params.suite.sourcePath) {
        await fsp.copyFile(
          params.suite.sourcePath,
          path.join(this._runDir, suiteSnapshotYamlPath),
        );
      }
      await fsp.writeFile(
        path.join(this._runDir, suiteSnapshotJsonPath),
        JSON.stringify(suiteRecord, null, 2),
        'utf-8',
      );
      this._inputSuite = suiteRecord;
    }

    const selectedTests: TestDefinition[] = [];
    this._testSnapshots.clear();
    for (const spec of params.specs) {
      const snapshotYamlPath = path.posix.join('input', 'tests', `${spec.testId!}.yaml`);
      const snapshotJsonPath = path.posix.join('input', 'tests', `${spec.testId!}.json`);
      const bindingReferences = collectBindingReferences(spec);
      const authored = {
        name: spec.name,
        description: spec.description,
        setup: spec.setup,
        steps: spec.steps,
        assertions: spec.assertions,
      };
      const workspaceSourcePath = spec.sourcePath
        ? toDisplayPath(params.workspaceRoot, spec.sourcePath)
        : undefined;
      const effectiveGoal = params.effectiveGoals.get(spec.testId!) ?? '';
      if (spec.sourcePath) {
        await fsp.copyFile(spec.sourcePath, path.join(this._runDir, snapshotYamlPath));
      }
      await fsp.writeFile(
        path.join(this._runDir, snapshotJsonPath),
        JSON.stringify(
          {
            testId: spec.testId!,
            testName: spec.name,
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
      this._testSnapshots.set(spec.testId!, {
        authored,
        bindingReferences,
        snapshotYamlPath,
        snapshotJsonPath,
        workspaceSourcePath: workspaceSourcePath ?? spec.sourcePath ?? '',
        effectiveGoal,
      });
      selectedTests.push({
        testId: spec.testId!,
        name: spec.name,
        relativePath: spec.relativePath,
        workspaceSourcePath,
        snapshotYamlPath,
        snapshotJsonPath,
        bindingReferences,
        setup: spec.setup,
        steps: spec.steps,
        assertions: spec.assertions,
      });
    }

    this._inputTests = selectedTests;
  }

  async writeTestRecord(
    spec: TestDefinition,
    result: TestExecutionResult,
    bindings: RuntimeBindings,
  ): Promise<TestResult> {
    const specDir = path.join(this._runDir, 'tests', spec.testId!);
    const stepDir = path.join(specDir, 'actions');
    const screenshotDir = path.join(specDir, 'screenshots');
    await fsp.mkdir(stepDir, { recursive: true });
    await fsp.mkdir(screenshotDir, { recursive: true });

    const recordingRelative = await this._copyRecordingArtifact(spec.testId!, result.recording);
    const recordingStartedAt = result.recording?.startedAt;
    const recordingCompletedAt = result.recording?.completedAt;

    const steps: AgentAction[] = [];
    for (const [index, step] of result.steps.entries()) {
      const stepNumber = index + 1;
      const stepFileBase = `${String(stepNumber).padStart(3, '0')}`;
      const stepJsonRelative = path.posix.join('tests', spec.testId!, 'actions', `${stepFileBase}.json`);
      const screenshotRelative = step.screenshot
        ? path.posix.join('tests', spec.testId!, 'screenshots', `${stepFileBase}.jpg`)
        : undefined;

      if (step.screenshot && screenshotRelative) {
        const buffer = decodeScreenshot(step.screenshot);
        await fsp.writeFile(path.join(this._runDir, screenshotRelative), buffer);
      }

      const artifactStep = toAgentAction(step, {
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

    const specRecord: TestResult = {
      testId: spec.testId!,
      testName: spec.name,
      sourcePath: spec.sourcePath ?? '',
      relativePath: spec.relativePath ?? '',
      success: result.success,
      status: resolveTestStatus(result),
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
    specs: TestResult[];
    successOverride?: boolean;
    statusOverride?: RunStatus;
    failurePhase?: FailurePhase;
    diagnosticsSummary?: string;
  }): Promise<RunSummary> {
    const passedCount = params.specs.filter((spec) => spec.success).length;
    const failedCount = params.specs.length - passedCount;
    const stepCount = params.specs.reduce((total, spec) => total + spec.steps.length, 0);
    const summary: RunSummary = {
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
      testCount: params.specs.length,
      passedCount,
      failedCount,
      stepCount,
      target: this._runTarget,
      variables: this._bindings.variables,
      tests: params.specs.map((spec) => ({
        testId: spec.testId,
        testName: spec.testName,
        relativePath: spec.relativePath,
        success: spec.success,
        status: spec.status,
        durationMs: spec.durationMs,
        resultFile: path.posix.join('tests', spec.testId, 'result.json'),
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
    spec: TestDefinition;
    bindings: RuntimeBindings;
    message: string;
    platform: string;
    startedAt: string;
    completedAt: string;
  }): Promise<TestResult> {
    const specDir = path.join(this._runDir, 'tests', params.spec.testId!);
    const stepDir = path.join(specDir, 'actions');
    const screenshotDir = path.join(specDir, 'screenshots');
    await fsp.mkdir(specDir, { recursive: true });
    await fsp.mkdir(stepDir, { recursive: true });
    await fsp.mkdir(screenshotDir, { recursive: true });

    const stepJsonRelative = path.posix.join('tests', params.spec.testId!, 'actions', '001.json');
    const screenshotRelative = path.posix.join(
      'tests',
      params.spec.testId!,
      'screenshots',
      '001.jpg',
    );
    const failureMessage =
      redactResolvedValue(params.message, params.bindings) ?? params.message;
    const failureStep: AgentAction = {
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

    const specRecord: TestResult = {
      testId: params.spec.testId!,
      testName: params.spec.name,
      sourcePath: params.spec.sourcePath ?? '',
      relativePath: params.spec.relativePath ?? '',
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
    specs: TestResult[];
    success: boolean;
    status: RunStatus;
    failurePhase?: FailurePhase;
    diagnosticsSummary?: string;
  }): RunManifest {
    const testRecords = params.specs.map((spec) => this._toRunManifestTest(spec));
    const stepTotal = testRecords.reduce(
      (total, spec) => total + (spec.counts?.executionStepsTotal ?? 0),
      0,
    );
    const stepPassed = testRecords.reduce(
      (total, spec) => total + (spec.counts?.executionStepsPassed ?? 0),
      0,
    );
    const firstFailure = findRunFirstFailure(testRecords, params.diagnosticsSummary);
    return {
      schemaVersion: 2,
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
          tests: {
            total: testRecords.length,
            passed: testRecords.filter((spec) => spec.success).length,
            failed: testRecords.filter((spec) => !spec.success).length,
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
        tests: this._inputTests,
        cli: this._cliContext,
      },
      tests: testRecords,
      paths: {
        runJson: 'run.json',
        summaryJson: 'summary.json',
        log: 'runner.log',
        runContextJson: this._runContextJsonPath,
      },
    };
  }

  private _toRunManifestTest(spec: TestResult): TestResult {
    const snapshot = this._testSnapshots.get(spec.testId);
    const steps = spec.steps.map((step) => ({ ...step })) as AgentAction[];
    const passedSteps = steps.filter((step) => step.success).length;
    const firstFailureStep = steps.find((step) => !step.success);
    const firstFailure: FirstFailure | undefined = firstFailureStep
      ? {
          testId: spec.testId,
          testName: spec.testName,
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
      authored: snapshot?.authored
        ? {
            name: snapshot.authored.name,
            description: snapshot.authored.description,
            setup: snapshot.authored.setup,
            steps: snapshot.authored.steps,
            assertions: snapshot.authored.assertions,
          }
        : {
            name: spec.testName,
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
      resultJsonPath: path.posix.join('tests', spec.testId, 'result.json'),
      steps,
    };
  }

  private async _copyRecordingArtifact(
    testId: string,
    recording: TestExecutionResult['recording'],
  ): Promise<string | undefined> {
    if (!recording?.filePath) {
      return undefined;
    }

    const ext = path.extname(recording.filePath) || '.mov';
    const recordingRelative = path.posix.join('tests', testId, `recording${ext}`);
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

function resolveTestStatus(result: TestExecutionResult): TestStatus {
  if (result.status === 'aborted') {
    return 'aborted';
  }
  return result.success ? 'success' : 'failure';
}

function collectBindingReferences(spec: TestDefinition): BindingReference {
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
  steps: AgentAction[],
): string | undefined {
  const failedScreenshot = steps.find((step) => !step.success && step.screenshotFile);
  if (failedScreenshot?.screenshotFile) {
    return failedScreenshot.screenshotFile;
  }
  return steps.find((step) => step.screenshotFile)?.screenshotFile;
}

function findRunFirstFailure(
  specs: TestResult[],
  diagnosticsSummary?: string,
): FirstFailure | undefined {
  const failedSpec = specs.find((spec) => !spec.success);
  if (failedSpec?.firstFailure) {
    return failedSpec.firstFailure;
  }
  if (failedSpec) {
    return {
      testId: failedSpec.testId,
      testName: failedSpec.testName,
      message: failedSpec.message,
      screenshotPath: failedSpec.previewScreenshotPath,
    };
  }
  if (diagnosticsSummary) {
    return { message: diagnosticsSummary };
  }
  return undefined;
}

function toAgentAction(
  step: AgentActionResult,
  params: {
    stepNumber: number;
    bindings: RuntimeBindings;
    screenshotFile?: string;
    videoOffsetMs?: number;
    stepJsonFile: string;
  },
): AgentAction & { stepJsonFile: string } {
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
  trace: AgentActionResult['trace'],
  bindings: RuntimeBindings,
): AgentAction['trace'] {
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
  timing: AgentActionResult['timing'],
  bindings: RuntimeBindings,
): AgentAction['timing'] {
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
