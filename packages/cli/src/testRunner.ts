import * as path from 'node:path';
import {
  Logger,
  LogLevel,
  type DeviceInfo,
  type DeviceInventoryDiagnostic,
  type LogEntry,
  type RunTargetRecord,
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
import {
  runCheck,
  type CheckRunnerOptions,
  type CheckRunnerResult,
} from './checkRunner.js';
import { ReportWriter } from './reportWriter.js';
import { rebuildRunIndex } from './runIndex.js';
import type { LoadedEnvironmentConfig } from './specLoader.js';
import {
  formatHostPreflightReport,
  resolveTestRequestedPlatforms,
  runHostPreflight,
  shouldBlockLocalRunPreflight,
} from './hostPreflight.js';
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
  runId: string;
  runDir: string;
  runIndexPath: string;
  specResults: SpecArtifactRecord[];
}

export const testRunnerDependencies = {
  prepareGoalSession,
  executeGoalOnSession,
  runCheck,
  runHostPreflight,
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

  let checked: CheckRunnerResult;
  let effectiveGoals = new Map<string, string>();
  try {
    checked = await testRunnerDependencies.runCheck({
      ...options,
      requireSelection: true,
    });
    effectiveGoals = new Map(
      checked.specs.map((spec) => [
        spec.specId,
        compileSpecToGoal(spec, checked.environment.bindings),
      ]),
    );
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
      cliContext: buildCliContext(options),
      modelContext: buildModelContext(options.provider, options.modelName),
      appContext: buildAppContext(options.appPath),
      target: buildFallbackRunTarget(options),
      failurePhase: 'validation',
    });
    return failedRun;
  }

  try {
    const requestedPlatforms = resolveTestRequestedPlatforms(
      options.platform ?? checked.appOverride?.inferredPlatform,
    );
    const preflight = await testRunnerDependencies.runHostPreflight({
      requestedPlatforms,
    });
    if (shouldBlockLocalRunPreflight(preflight)) {
      const failedRun = await writeRunFailureArtifacts({
        workspace,
        envName: checked.environment.envName,
        platform: inferPlatformHint(
          options.platform ?? checked.appOverride?.inferredPlatform,
          checked.appOverride?.appPath ?? options.appPath,
        ),
        startedAt,
        bindings: checked.environment.bindings,
        message: `Run setup failed before execution: ${formatHostPreflightReport(preflight, 'test')}`,
        bufferedLogEntries,
        environment: checked.environment,
        specs: checked.specs,
        suite: checked.suite,
        effectiveGoals,
        workspaceRoot: checked.workspace.rootDir,
        cliContext: buildCliContext(options),
        modelContext: buildModelContext(options.provider, options.modelName),
        appContext: buildAppContext(checked.appOverride?.appPath ?? options.appPath),
        target: checked.target,
        failurePhase: 'setup',
      });
      return failedRun;
    }

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
      environment: checked.environment,
      specs: checked.specs,
      suite: checked.suite,
      effectiveGoals,
      workspaceRoot: checked.workspace.rootDir,
      cliContext: buildCliContext(options),
      modelContext: buildModelContext(options.provider, options.modelName),
      appContext: buildAppContext(checked.appOverride?.appPath ?? options.appPath),
      target: checked.target,
      failurePhase: 'setup',
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
    await reportWriter.writeRunInputs({
      workspaceRoot: checked.workspace.rootDir,
      environment: checked.environment,
      specs: checked.specs,
      effectiveGoals,
      cli: buildCliContext(options),
      model: buildModelContext(options.provider, options.modelName),
      app: buildAppContext(checked.appOverride?.appPath ?? options.appPath),
      target: checked.target,
      suite: checked.suite,
    });
    reportWriter.appendLogLine(`Starting FinalRun test run ${path.basename(runDir)}`);

    for (const spec of checked.specs) {
      reportWriter.appendLogLine(`Running spec ${spec.relativePath}`);
      const specStartedAt = new Date().toISOString();

      try {
        const goal = effectiveGoals.get(spec.specId) ??
          compileSpecToGoal(spec, checked.environment.bindings);
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
      failurePhase: encounteredFailure ? 'execution' : undefined,
    });
    await rebuildRunIndex(workspace.artifactsDir);

    return {
      success,
      runId: path.basename(runDir),
      runDir,
      runIndexPath: path.join(workspace.artifactsDir, 'runs.json'),
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
  environment?: LoadedEnvironmentConfig;
  specs?: Awaited<ReturnType<typeof runCheck>>['specs'];
  suite?: Awaited<ReturnType<typeof runCheck>>['suite'];
  effectiveGoals?: Map<string, string>;
  workspaceRoot?: string;
  cliContext: ReturnType<typeof buildCliContext>;
  modelContext: ReturnType<typeof buildModelContext>;
  appContext: ReturnType<typeof buildAppContext>;
  target: RunTargetRecord;
  failurePhase: 'validation' | 'setup' | 'execution';
}): Promise<TestRunnerResult> {
  const { reportWriter, runDir } = await createReportWriter({
    workspace: params.workspace,
    envName: params.envName,
    platform: params.platform,
    startedAt: params.startedAt,
    bindings: params.bindings,
  });
  reportWriter.setRunContext({
    cli: params.cliContext,
    model: params.modelContext,
    app: params.appContext,
    target: params.target,
  });
  flushBufferedLogEntries(params.bufferedLogEntries, reportWriter.createLoggerSink());
  if (
    params.environment &&
    params.specs &&
    params.effectiveGoals &&
    params.workspaceRoot
  ) {
    await reportWriter.writeRunInputs({
      workspaceRoot: params.workspaceRoot,
      environment: params.environment,
      specs: params.specs,
      suite: params.suite,
      effectiveGoals: params.effectiveGoals,
      target: params.target,
      cli: params.cliContext,
      model: params.modelContext,
      app: params.appContext,
    });
  }
  reportWriter.appendLogLine(params.message);
  if (params.diagnostics && params.diagnostics.length > 0) {
    reportWriter.appendRawBlock(formatDiagnosticsForOutput(params.diagnostics));
  }
  await reportWriter.finalize({
    startedAt: params.startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    specs: [],
    successOverride: false,
    failurePhase: params.failurePhase,
    diagnosticsSummary:
      params.diagnostics && params.diagnostics.length > 0
        ? params.diagnostics.map((diagnostic) => diagnostic.summary).join(' | ')
        : params.message,
  });
  await rebuildRunIndex(params.workspace.artifactsDir);
  return {
    success: false,
    runId: path.basename(runDir),
    runDir,
    runIndexPath: path.join(params.workspace.artifactsDir, 'runs.json'),
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

function buildCliContext(
  options: TestRunnerOptions,
): {
  command: string;
  selectors: string[];
  suitePath?: string;
  requestedPlatform?: string;
  appOverridePath?: string;
  debug: boolean;
  maxIterations?: number;
} {
  const commandParts = ['finalrun', 'test'];
  if (options.suitePath) {
    commandParts.push('--suite', options.suitePath);
  }
  return {
    command: commandParts.join(' '),
    selectors: options.selectors ?? [],
    suitePath: options.suitePath,
    requestedPlatform: options.platform,
    appOverridePath: options.appPath,
    debug: options.debug === true,
    maxIterations: options.maxIterations,
  };
}

function buildModelContext(
  provider: string | undefined,
  modelName: string | undefined,
): {
  provider: string;
  modelName: string;
  label: string;
} {
  const resolvedProvider = provider ?? 'unknown';
  const resolvedModelName = modelName ?? 'unknown';
  return {
    provider: resolvedProvider,
    modelName: resolvedModelName,
    label: `${resolvedProvider}/${resolvedModelName}`,
  };
}

function buildAppContext(
  appOverridePath?: string,
): {
  source: 'repo' | 'override';
  label: string;
  overridePath?: string;
} {
  if (!appOverridePath) {
    return {
      source: 'repo',
      label: 'repo app',
    };
  }
  return {
    source: 'override',
    label: path.basename(appOverridePath),
    overridePath: appOverridePath,
  };
}

function buildFallbackRunTarget(options: CheckRunnerOptions): RunTargetRecord {
  if (!options.suitePath) {
    return { type: 'direct' };
  }

  return {
    type: 'suite',
    suitePath: options.suitePath,
  };
}
