import * as path from 'node:path';
import {
  Logger,
  LogLevel,
  type DeviceInfo,
  type DeviceInventoryDiagnostic,
  type LogEntry,
  type RuntimeBindings,
  type SpecArtifactRecord,
} from '@finalrun/common';
import {
  executeGoalOnSession,
  isDevicePreparationError,
  prepareGoalSession,
  type GoalSession,
} from './goalRunner.js';
import { formatDiagnosticsForOutput } from './deviceInventoryPresenter.js';
import { compileSpecToGoal } from './specCompiler.js';
import { runCheck, type CheckRunnerOptions } from './checkRunner.js';
import { ReportWriter } from './reportWriter.js';
import {
  createRunId,
  ensureWorkspaceDirectories,
  resolveEnvironmentFile,
  resolveWorkspace,
  type FinalRunWorkspace,
} from './workspace.js';

export interface TestRunnerOptions extends CheckRunnerOptions {
  apiKey: string;
  provider: string;
  modelName: string;
  maxIterations?: number;
  debug?: boolean;
}

export interface TestRunnerResult {
  success: boolean;
  runDir: string;
  specResults: SpecArtifactRecord[];
}

export const testRunnerDependencies = {
  prepareGoalSession,
  executeGoalOnSession,
  runCheck,
  resolveWorkspace,
  ensureWorkspaceDirectories,
};

export async function runTests(
  options: TestRunnerOptions,
): Promise<TestRunnerResult> {
  Logger.init({
    level: options.debug ? LogLevel.DEBUG : LogLevel.INFO,
    resetSinks: true,
  });
  const workspace = await testRunnerDependencies.resolveWorkspace(options.cwd);
  await testRunnerDependencies.ensureWorkspaceDirectories(workspace);

  const startedAt = new Date();
  const specResults: SpecArtifactRecord[] = [];
  let encounteredFailure = false;
  let reportWriter: ReportWriter | undefined;
  let runDir = '';
  let logSink: ReturnType<ReportWriter['createLoggerSink']> | undefined;
  let goalSession: GoalSession | undefined;
  const fallbackEnvName = await resolveRunEnvName(workspace.envDir, options.envName);
  const bufferedLogEntries: LogEntry[] = [];
  const bufferingSink = (entry: LogEntry) => {
    bufferedLogEntries.push(entry);
  };
  Logger.addSink(bufferingSink);

  let checked;
  try {
    checked = await testRunnerDependencies.runCheck({
      ...options,
      requireSelection: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun = await writeRunFailureArtifacts({
      workspace,
      envName: fallbackEnvName,
      platform: inferPlatformHint(options.platform, options.appPath),
      startedAt,
      bindings: EMPTY_RUNTIME_BINDINGS,
      message: `Run validation failed: ${message}`,
      bufferedLogEntries,
    });
    return failedRun;
  }

  try {
    goalSession = await testRunnerDependencies.prepareGoalSession({
      platform: options.platform ?? checked.appOverride?.inferredPlatform,
      appOverridePath: checked.appOverride?.appPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun = await writeRunFailureArtifacts({
      workspace,
      envName: checked.environment.envName,
      platform: inferPlatformHint(
        options.platform ?? checked.appOverride?.inferredPlatform,
        checked.appOverride?.appPath ?? options.appPath,
      ),
      startedAt,
      bindings: checked.environment.bindings,
      message: `Run setup failed before execution: ${message}`,
      bufferedLogEntries,
      diagnostics: isDevicePreparationError(error) ? error.diagnostics : [],
    });
    return failedRun;
  }

  ({ reportWriter, runDir } = await createReportWriter({
    workspace,
    envName: checked.environment.envName,
    platform: goalSession.platform,
    startedAt,
    bindings: checked.environment.bindings,
  }));
  logSink = reportWriter.createLoggerSink();
  flushBufferedLogEntries(bufferedLogEntries, logSink);
  Logger.removeSink(bufferingSink);
  Logger.addSink(logSink);

  try {
    reportWriter.appendLogLine(`Starting FinalRun test run ${path.basename(runDir)}`);

    for (const spec of checked.specs) {
      reportWriter.appendLogLine(`Running spec ${spec.relativePath}`);
      const specStartedAt = new Date().toISOString();

      try {
        const goal = compileSpecToGoal(spec, checked.environment.bindings);
        const goalResult = await testRunnerDependencies.executeGoalOnSession(goalSession, {
          goal,
          apiKey: options.apiKey,
          provider: options.provider,
          modelName: options.modelName,
          maxIterations: options.maxIterations,
          debug: options.debug,
          runtimeBindings: checked.environment.bindings,
          recording: {
            testRunId: path.basename(runDir),
            testCaseId: spec.specId,
          },
        });

        const specRecord = await reportWriter.writeSpecRecord(
          spec,
          goalResult,
          checked.environment.bindings,
        );
        specResults.push(specRecord);
        encounteredFailure ||= !goalResult.success;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        encounteredFailure = true;
        reportWriter.appendLogLine(
          `Spec ${spec.relativePath} failed before completion: ${message}`,
        );
        specResults.push(
          await reportWriter.writeSpecFailureRecord({
            spec,
            bindings: checked.environment.bindings,
            message,
            platform: goalSession.platform,
            startedAt: specStartedAt,
            completedAt: new Date().toISOString(),
          }),
        );
        break;
      }
    }

    const success =
      !encounteredFailure && specResults.every((spec) => spec.success);
    await reportWriter.finalize({
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      specs: specResults,
      successOverride: success,
    });

    return {
      success,
      runDir,
      specResults,
    };
  } finally {
    if (goalSession) {
      try {
        await goalSession.cleanup();
      } catch (error) {
        Logger.w('Failed to clean up device resources:', error);
      }
    }
    if (logSink) {
      Logger.removeSink(logSink);
    }
    Logger.removeSink(bufferingSink);
  }
}

export function selectExecutionPlatform(
  devices: Array<Pick<DeviceInfo, 'getPlatform'>>,
  preferredPlatform?: string,
): string {
  const availablePlatforms = new Set(devices.map((device) => device.getPlatform()));
  if (preferredPlatform) {
    const matchingPlatform = preferredPlatform.toLowerCase();
    const match = devices.some((device) => device.getPlatform() === matchingPlatform);
    if (!match) {
      throw new Error(`No ${preferredPlatform} devices found.`);
    }
    return matchingPlatform;
  }

  if (availablePlatforms.size > 1) {
    throw new Error(
      'Multiple platforms are available. Choose --platform android or --platform ios.',
    );
  }

  return devices[0]!.getPlatform();
}

const EMPTY_RUNTIME_BINDINGS: RuntimeBindings = {
  secrets: {},
  variables: {},
};

async function createReportWriter(params: {
  workspace: FinalRunWorkspace;
  envName: string;
  platform: string;
  startedAt: Date;
  bindings: RuntimeBindings;
}): Promise<{ reportWriter: ReportWriter; runDir: string }> {
  const runId = createRunId({
    envName: params.envName,
    platform: params.platform,
    startedAt: params.startedAt,
  });
  const runDir = path.join(params.workspace.artifactsDir, runId);
  const reportWriter = new ReportWriter({
    runDir,
    envName: params.envName,
    platform: params.platform,
    runId,
    bindings: params.bindings,
  });
  await reportWriter.init();
  return { reportWriter, runDir };
}

async function writeRunFailureArtifacts(params: {
  workspace: FinalRunWorkspace;
  envName: string;
  platform: string;
  startedAt: Date;
  bindings: RuntimeBindings;
  message: string;
  bufferedLogEntries: LogEntry[];
  diagnostics?: DeviceInventoryDiagnostic[];
}): Promise<TestRunnerResult> {
  const { reportWriter, runDir } = await createReportWriter({
    workspace: params.workspace,
    envName: params.envName,
    platform: params.platform,
    startedAt: params.startedAt,
    bindings: params.bindings,
  });
  flushBufferedLogEntries(params.bufferedLogEntries, reportWriter.createLoggerSink());
  reportWriter.appendLogLine(params.message);
  if (params.diagnostics && params.diagnostics.length > 0) {
    reportWriter.appendRawBlock(formatDiagnosticsForOutput(params.diagnostics));
  }
  await reportWriter.finalize({
    startedAt: params.startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    specs: [],
    successOverride: false,
  });
  return {
    success: false,
    runDir,
    specResults: [],
  };
}

function inferPlatformHint(
  requestedPlatform?: string,
  appPath?: string,
): string {
  if (requestedPlatform) {
    return requestedPlatform.toLowerCase();
  }
  const lowerPath = appPath?.toLowerCase();
  if (lowerPath?.endsWith('.apk')) {
    return 'android';
  }
  if (lowerPath?.endsWith('.app')) {
    return 'ios';
  }
  return 'unknown';
}

async function resolveRunEnvName(
  envDir: string,
  requestedEnvName?: string,
): Promise<string> {
  try {
    const resolvedEnvironment = await resolveEnvironmentFile(envDir, requestedEnvName);
    return resolvedEnvironment.envName;
  } catch {
    return requestedEnvName ?? 'none';
  }
}

function flushBufferedLogEntries(
  entries: LogEntry[],
  sink: ReturnType<ReportWriter['createLoggerSink']>,
): void {
  for (const entry of entries) {
    sink(entry);
  }
  entries.length = 0;
}
