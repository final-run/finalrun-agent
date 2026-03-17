import * as path from 'node:path';
import {
  Logger,
  LogLevel,
  type DeviceInfo,
  type RuntimeBindings,
  type SpecArtifactRecord,
} from '@finalrun/common';
import { DeviceNode } from '@finalrun/device-node';
import { runGoal } from './goalRunner.js';
import { CliFilePathUtil } from './filePathUtil.js';
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
  runGoal,
  resolveExecutionPlatform,
  runCheck,
  resolveWorkspace,
  ensureWorkspaceDirectories,
};

export async function runTests(
  options: TestRunnerOptions,
): Promise<TestRunnerResult> {
  const workspace = await testRunnerDependencies.resolveWorkspace(options.cwd);
  await testRunnerDependencies.ensureWorkspaceDirectories(workspace);

  const startedAt = new Date();
  const specResults: SpecArtifactRecord[] = [];
  let encounteredFailure = false;
  let reportWriter: ReportWriter | undefined;
  let runDir = '';
  let logSink: ReturnType<ReportWriter['createLoggerSink']> | undefined;
  const fallbackEnvName = await resolveRunEnvName(workspace.envDir, options.envName);

  let checked;
  try {
    checked = await testRunnerDependencies.runCheck(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun = await writeRunFailureArtifacts({
      workspace,
      envName: fallbackEnvName,
      platform: inferPlatformHint(options.platform, options.appPath),
      startedAt,
      bindings: EMPTY_RUNTIME_BINDINGS,
      message: `Run validation failed: ${message}`,
    });
    return failedRun;
  }

  let resolvedPlatform: string;
  try {
    resolvedPlatform = await testRunnerDependencies.resolveExecutionPlatform(
      options.platform ?? checked.appOverride?.inferredPlatform,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failedRun = await writeRunFailureArtifacts({
      workspace,
      envName: checked.environment.envName,
      platform:
        checked.appOverride?.inferredPlatform ??
        inferPlatformHint(options.platform, options.appPath),
      startedAt,
      bindings: checked.environment.bindings,
      message: `Run setup failed before execution: ${message}`,
    });
    return failedRun;
  }

  ({ reportWriter, runDir } = await createReportWriter({
    workspace,
    envName: checked.environment.envName,
    platform: resolvedPlatform,
    startedAt,
    bindings: checked.environment.bindings,
  }));

  Logger.init({
    level: options.debug ? LogLevel.DEBUG : LogLevel.INFO,
    resetSinks: true,
  });
  logSink = reportWriter.createLoggerSink();
  Logger.addSink(logSink);

  try {
    reportWriter.appendLogLine(`Starting FinalRun test run ${path.basename(runDir)}`);

    for (const spec of checked.specs) {
      reportWriter.appendLogLine(`Running spec ${spec.relativePath}`);
      const specStartedAt = new Date().toISOString();

      try {
        const goal = compileSpecToGoal(spec, checked.environment.bindings);
        const goalResult = await testRunnerDependencies.runGoal({
          goal,
          apiKey: options.apiKey,
          provider: options.provider,
          modelName: options.modelName,
          maxIterations: options.maxIterations,
          debug: options.debug,
          platform: resolvedPlatform,
          appOverridePath: checked.appOverride?.appPath,
          runtimeBindings: checked.environment.bindings,
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
            platform: resolvedPlatform,
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
    if (logSink) {
      Logger.removeSink(logSink);
    }
  }
}

async function resolveExecutionPlatform(
  preferredPlatform?: string,
): Promise<string> {
  const filePathUtil = new CliFilePathUtil();
  const adbPath = await filePathUtil.getADBPath();
  const deviceNode = DeviceNode.getInstance();
  deviceNode.init(filePathUtil);

  const devices = await deviceNode.detectDevices(adbPath);
  if (devices.length === 0) {
    throw new Error('No devices found. Connect an Android or iOS device and try again.');
  }

  return selectExecutionPlatform(devices, preferredPlatform);
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
}): Promise<TestRunnerResult> {
  const { reportWriter, runDir } = await createReportWriter({
    workspace: params.workspace,
    envName: params.envName,
    platform: params.platform,
    startedAt: params.startedAt,
    bindings: params.bindings,
  });
  reportWriter.appendLogLine(params.message);
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
