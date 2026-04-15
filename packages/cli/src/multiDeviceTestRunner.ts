import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {
  Logger,
  LogLevel,
  PLATFORM_ANDROID,
  RecordingRequest,
  type AgentAction,
  type EnvironmentRecord,
  type FirstFailure,
  type MultiDeviceConfig,
  type PerDeviceArtifact,
  type RunManifest,
  type RunStatus,
  type RunTarget,
  type TestDefinition,
  type TestResult,
  type TestStatus,
} from '@finalrun/common';
import {
  AIAgent,
  MultiDeviceOrchestrator,
  type MultiDeviceExecutionResult,
  type MultiDeviceOrchestratorDeviceInput,
} from '@finalrun/goal-executor';
import type { ExecutionStatus } from '@finalrun/goal-executor';
import { CliEnv } from './env.js';
import {
  collectAllMultiDeviceTests,
  loadMultiDeviceConfig,
  loadMultiDeviceTest,
} from './multiDeviceTestLoader.js';
import { compileMultiDeviceTestObjective } from './multiDeviceTestCompiler.js';
import {
  prepareMultiDeviceTestSession,
  type MultiDeviceTestSession,
} from './multiDeviceSessionRunner.js';
import { rebuildRunIndex } from './runIndex.js';
import type { TestRunnerOptions, TestRunnerResult } from './testRunner.js';
import { createRunId, type FinalRunWorkspace } from './workspace.js';
import { loadEnvironmentConfig } from './testLoader.js';

/**
 * Multi-device selector predicate.
 *
 * A selector is multi-device iff its normalized form begins with
 * `multi-device/tests/`. All other selectors route to the single-device
 * `TestExecutor` path and remain byte-identical to pre-change behavior.
 */
export function isMultiDeviceSelector(selector: string): boolean {
  const normalized = selector.split(path.sep).join('/');
  return normalized.startsWith('multi-device/tests/');
}

/**
 * Multi-device test runner — CLI entry point for selectors under
 * `multi-device/tests/*`.
 *
 * Wires the `MultiDeviceOrchestrator` into a simplified reporting path that
 * creates the run directory, invokes the orchestrator per test, and emits a
 * TestResult record with `multiDevice: true` and `perDeviceArtifacts`. Falls
 * through to `rebuildRunIndex` at the end so the UI picks it up.
 *
 * Single-device paths are untouched — this entry point is only reached when
 * `isMultiDeviceSelector()` matches the caller's selectors.
 */
export async function runMultiDeviceTests(
  options: TestRunnerOptions & { workspace: FinalRunWorkspace },
): Promise<TestRunnerResult> {
  Logger.init({
    level: options.debug ? LogLevel.DEBUG : LogLevel.INFO,
    resetSinks: true,
  });
  const workspace = options.workspace;
  if (!workspace.multiDeviceDir || !workspace.multiDeviceTestsDir) {
    throw new Error(
      'Multi-device selectors provided but workspace is missing `.finalrun/multi-device/` subtree',
    );
  }

  // Load devices.yaml — enforces exactly-2, same-platform, Android-only rules.
  const loadedMultiDevice = await loadMultiDeviceConfig(workspace.multiDeviceDir);
  const multiDeviceConfig = loadedMultiDevice.config;
  // Load environment (multi-device tests share the same variables/secrets
  // binding semantics as single-device tests).
  const runtimeEnv = new CliEnv();
  if (options.envName !== undefined) {
    runtimeEnv.load(options.envName, { cwd: workspace.rootDir });
  } else {
    runtimeEnv.load(undefined, { includeDotEnv: false, cwd: workspace.rootDir });
  }
  // Multi-device v1 does not yet ship a separate environment resolver — fall
  // back to loading from the single-device env file if present; otherwise use
  // empty bindings.
  let bindings: import('@finalrun/common').RuntimeBindings = {
    variables: {},
    secrets: {},
  };
  const envFallbackPath = path.join(
    workspace.finalrunDir,
    'environments',
    `${options.envName ?? 'default'}.yaml`,
  );
  try {
    const loaded = await loadEnvironmentConfig(
      envFallbackPath,
      options.envName ?? 'default',
      runtimeEnv,
    );
    bindings = loaded.bindings;
  } catch {
    // If no environment file is present, empty bindings are fine — the
    // multi-device compiler interpolates only `${variables.*}` tokens.
  }

  // Resolve selectors → multi-device test definitions.
  const tests = await resolveMultiDeviceTests(
    workspace,
    options.selectors ?? [],
    multiDeviceConfig,
  );
  if (tests.length === 0) {
    throw new Error(
      'No multi-device tests resolved from the provided selectors. ' +
        'Make sure selectors start with `multi-device/tests/`.',
    );
  }

  // Bootstrap: prepare multi-device session (inventory, auto-assign, parallel setUp).
  let session: MultiDeviceTestSession;
  try {
    session = await prepareMultiDeviceTestSession(multiDeviceConfig);
  } catch (error) {
    throw new Error(
      `Failed to prepare multi-device session: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const startedAt = new Date();
  const runId = createRunId({
    envName: options.envName ?? 'default',
    platform: PLATFORM_ANDROID,
    startedAt,
  });
  const runDir = path.join(workspace.artifactsDir, runId);
  const testsDir = path.join(runDir, 'tests');
  await fsp.mkdir(testsDir, { recursive: true });

  const runAbortController = new AbortController();
  const removeSigint = addSigintHandler(() => {
    Logger.w('\nReceived SIGINT — aborting multi-device run...');
    runAbortController.abort();
  });

  const testResults: TestResult[] = [];
  let encounteredFailure = false;

  try {
    for (const test of tests) {
      if (runAbortController.signal.aborted) {
        break;
      }

      Logger.i(`Running multi-device test: ${test.relativePath}`);
      const testStartedAt = new Date();
      const goal = compileMultiDeviceTestObjective(test, multiDeviceConfig, bindings);
      const testDir = path.join(testsDir, test.testId!);
      await fsp.mkdir(testDir, { recursive: true });

      // Build the orchestrator device inputs, wiring per-device recording
      // hooks that use the scoped RecordingManager keys (T004/T016).
      const deviceInputs = buildOrchestratorDeviceInputs({
        multiDeviceConfig,
        session,
        runId,
        testId: test.testId!,
        apiKey: options.apiKey,
        testDir,
      });

      const orchestrator = new MultiDeviceOrchestrator({
        goal,
        steps: test.steps,
        devices: deviceInputs,
        aiAgent: new AIAgent({
          provider: options.provider,
          modelName: options.modelName,
          apiKey: options.apiKey,
        }),
        maxIterations: options.maxIterations,
        abortSignal: runAbortController.signal,
        runtimeBindings: bindings,
      });

      let orchestratorResult: MultiDeviceExecutionResult;
      try {
        orchestratorResult = await orchestrator.executeGoal();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.e(`Multi-device orchestrator threw: ${message}`);
        orchestratorResult = {
          success: false,
          status: 'failure',
          message,
          startedAt: testStartedAt.toISOString(),
          completedAt: new Date().toISOString(),
          steps: [],
          totalIterations: 0,
          finalStepIndex: 0,
          failureReason: message,
        };
      }

      const testResult = buildMultiDeviceTestResult({
        test,
        result: orchestratorResult,
        testStartedAt,
        multiDeviceConfig,
        session,
      });
      await writeMultiDeviceTestRecord(testDir, testResult);
      testResults.push(testResult);
      encounteredFailure ||= !testResult.success;
      if (orchestratorResult.status === 'aborted') {
        break;
      }
    }

    const runTarget: RunTarget = options.suitePath
      ? { type: 'suite', suitePath: options.suitePath }
      : { type: 'direct' };
    await writeRunManifest({
      runDir,
      runId,
      startedAt,
      testResults,
      multiDeviceConfig,
      session,
      envName: options.envName ?? 'default',
      platform: PLATFORM_ANDROID,
      provider: options.provider,
      modelName: options.modelName,
      selectors: options.selectors ?? [],
      suitePath: options.suitePath,
      appOverridePath: options.appPath,
      debug: options.debug === true,
      maxIterations: options.maxIterations,
      invokedCommand: options.invokedCommand ?? 'test',
      tests,
      bindings,
      target: runTarget,
    });
    await rebuildRunIndex(workspace.artifactsDir);
  } finally {
    removeSigint();
    try {
      await session.cleanup();
    } catch (error) {
      Logger.w(
        `Failed to clean up multi-device session: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const runAborted = runAbortController.signal.aborted;
  const success = !runAborted && !encounteredFailure && testResults.every((t) => t.success);
  const status: ExecutionStatus = runAborted
    ? 'aborted'
    : success
      ? 'success'
      : 'failure';

  return {
    success,
    status,
    runId,
    runDir,
    runIndexPath: path.join(workspace.artifactsDir, 'runs.json'),
    testResults,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

async function resolveMultiDeviceTests(
  workspace: FinalRunWorkspace,
  selectors: string[],
  multiDeviceConfig: MultiDeviceConfig,
): Promise<TestDefinition[]> {
  if (!workspace.multiDeviceTestsDir) {
    return [];
  }
  if (selectors.length === 0) {
    return await collectAllMultiDeviceTests(
      workspace.multiDeviceTestsDir,
      multiDeviceConfig,
    );
  }
  const tests: TestDefinition[] = [];
  for (const selector of selectors) {
    // Strip leading `multi-device/tests/` to resolve against multiDeviceTestsDir.
    const normalized = selector.split(path.sep).join('/');
    const relative = normalized.replace(/^multi-device\/tests\//, '');
    const absolute = path.join(workspace.multiDeviceTestsDir, relative);
    const definition = await loadMultiDeviceTest(
      absolute,
      workspace.multiDeviceTestsDir,
      multiDeviceConfig,
    );
    tests.push(definition);
  }
  return tests;
}

function buildOrchestratorDeviceInputs(params: {
  multiDeviceConfig: MultiDeviceConfig;
  session: MultiDeviceTestSession;
  runId: string;
  testId: string;
  apiKey: string;
  testDir: string;
}): MultiDeviceOrchestratorDeviceInput[] {
  const inputs: MultiDeviceOrchestratorDeviceInput[] = [];
  for (const [key, def] of Object.entries(params.multiDeviceConfig.devices)) {
    const entry = params.session.devices.get(key);
    if (!entry) {
      throw new Error(`Multi-device session missing prepared entry for '${key}'`);
    }
    const deviceDir = path.join(params.testDir, key);
    const recordingExt = entry.platform === PLATFORM_ANDROID ? '.mp4' : '.mov';
    const recordingPath = path.join(deviceDir, `recording${recordingExt}`);
    inputs.push({
      key,
      agent: entry.device,
      platform: entry.platform,
      appIdentifier: def.app,
      startRecording: async () => {
        await fsp.mkdir(deviceDir, { recursive: true });
        const response = await entry.device.startRecordingScoped(
          new RecordingRequest({
            runId: params.runId,
            testId: params.testId,
            apiKey: params.apiKey,
            outputFilePath: recordingPath,
          }),
        );
        if (!response.success) {
          throw new Error(
            `startRecordingScoped on '${key}' failed: ${response.message ?? 'unknown'}`,
          );
        }
        const startedAt =
          (response.data?.['startedAt'] as string | undefined) ??
          new Date().toISOString();
        const filePath =
          (response.data?.['filePath'] as string | undefined) ?? recordingPath;
        return { startedAt, filePath };
      },
      stopRecording: async () => {
        const response = await entry.device.stopRecordingScoped(
          params.runId,
          params.testId,
        );
        const completedAt =
          (response.data?.['completedAt'] as string | undefined) ??
          new Date().toISOString();
        const filePath =
          (response.data?.['filePath'] as string | undefined) ?? recordingPath;
        return { completedAt, filePath };
      },
    });
  }
  return inputs;
}

function buildMultiDeviceTestResult(params: {
  test: TestDefinition;
  result: MultiDeviceExecutionResult;
  testStartedAt: Date;
  multiDeviceConfig: MultiDeviceConfig;
  session: MultiDeviceTestSession;
}): TestResult {
  const status: TestStatus = params.result.success
    ? 'success'
    : params.result.status === 'aborted'
      ? 'aborted'
      : 'failure';

  // Per-device artifact subfolders: tests/<testId>/<device>/
  const perDeviceArtifacts: Record<string, PerDeviceArtifact> = {};
  for (const key of params.session.devices.keys()) {
    const folder = path.posix.join('tests', params.test.testId!, key);
    const recording = params.result.recording?.devices[key];
    const extension =
      params.multiDeviceConfig.devices[key]!.platform === PLATFORM_ANDROID
        ? '.mp4'
        : '.mov';
    perDeviceArtifacts[key] = {
      folder,
      recordingFile: recording?.filePath
        ? path.posix.join(folder, `recording${extension}`)
        : undefined,
      recordingStartedAt: recording?.startedAt,
    };
  }

  // Shared-scrubber anchor for all devices — earliest recording start across
  // all devices (Cross-device causality: all step timestamps are measured
  // against this shared origin in the report-web UI).
  const anchorStartedAt = params.result.recording?.anchorStartedAt;

  // Map orchestrator step results into AgentAction records. Device tag is
  // preserved via the `device` discriminator field (added as optional in
  // packages/common TestResult.ts). Single-device outputs omit this field
  // entirely, so byte-identity remains intact for that path.
  //
  // Step numbering rule (T018): `stepNumber = iteration` (1-indexed, zero-padded
  // 3 digits) shared across devices. A parallel step at iteration 7 yields both
  // `alice/actions/007.json` and `bob/actions/007.json`; a sequential step at
  // iteration 8 on alice only yields `alice/actions/008.json` (bob slot absent).
  const steps: AgentAction[] = params.result.steps.map((step) => {
    const anchorMs = anchorStartedAt ? Date.parse(anchorStartedAt) : NaN;
    const deviceRec = params.result.recording?.devices[step.device];
    const deviceStartMs = deviceRec?.startedAt ? Date.parse(deviceRec.startedAt) : NaN;
    const stepMs = Date.parse(step.timestamp);
    // Per-device video offset: max(0, stepTimestamp - deviceRecordingStartedAt).
    // Falls back to the shared anchor if the per-device start is unavailable.
    const referenceStartMs = Number.isFinite(deviceStartMs) ? deviceStartMs : anchorMs;
    const videoOffsetMs =
      Number.isFinite(stepMs) && Number.isFinite(referenceStartMs)
        ? Math.max(0, stepMs - referenceStartMs)
        : undefined;
    const paddedIteration = String(step.iteration).padStart(3, '0');
    return {
      stepNumber: step.iteration,
      iteration: step.iteration,
      actionType: extractActionType(step.action),
      naturalLanguageAction: step.action,
      reason: step.reason,
      success: step.success,
      status: step.success ? 'success' : 'failure',
      errorMessage: step.errorMessage,
      timestamp: step.timestamp,
      device: step.device,
      videoOffsetMs,
      stepJsonFile: path.posix.join(
        'tests',
        params.test.testId!,
        step.device,
        'actions',
        `${paddedIteration}.json`,
      ),
    } satisfies AgentAction;
  });

  const startedAtIso = params.result.startedAt;
  const completedAtIso = params.result.completedAt;
  const durationMs = Math.max(
    0,
    Date.parse(completedAtIso) - Date.parse(startedAtIso),
  );

  // Platform is guaranteed identical across all devices by
  // `loadMultiDeviceConfig` — safe to pick from the first entry.
  const platform =
    Object.values(params.multiDeviceConfig.devices)[0]?.platform ?? PLATFORM_ANDROID;

  const totalSteps = steps.length;
  const failedSteps = steps.filter((s) => !s.success).length;

  return {
    testId: params.test.testId!,
    testName: params.test.name,
    sourcePath: params.test.sourcePath ?? '',
    relativePath: params.test.relativePath ?? '',
    success: params.result.success,
    status,
    message: params.result.message,
    platform,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    durationMs,
    steps,
    counts: {
      executionStepsTotal: totalSteps,
      executionStepsPassed: totalSteps - failedSteps,
      executionStepsFailed: failedSteps,
    },
    authored: params.test,
    effectiveGoal: undefined,
    multiDevice: true,
    perDeviceArtifacts,
  };
}

/**
 * Extract a short `actionType` label from a natural-language action string.
 * Falls back to `'action'` when no leading verb token is detected.
 */
function extractActionType(action: string): string {
  const match = /^[a-zA-Z_]+/.exec(action.trim());
  return match ? match[0].toLowerCase() : 'action';
}

/**
 * Write multi-device per-test artifacts.
 *
 * Layout (T018):
 *   tests/{testId}/
 *     test.json                                  ← merged TestResult
 *     {alice,bob}/
 *       actions/{003,007,...}.json               ← per-step AgentAction
 *       screenshots/                             ← (reserved; orchestrator v1 does not write screenshots)
 *
 * Step numbering is `iteration` (1-indexed, zero-padded to 3 digits), shared
 * across devices. A parallel iteration produces one file per device at the
 * same padded number; a sequential iteration leaves the inactive device's
 * slot absent (sparse). Each JSON includes the `device` field so downstream
 * consumers do not need the folder name to recover the device tag.
 */
async function writeMultiDeviceTestRecord(
  testDir: string,
  result: TestResult,
): Promise<void> {
  await fsp.mkdir(testDir, { recursive: true });

  // Per-device subfolders: `tests/{testId}/<device>/{actions,screenshots}/`.
  const devicesForSteps = new Set<string>();
  for (const step of result.steps) {
    if (step.device) devicesForSteps.add(step.device);
  }
  for (const device of devicesForSteps) {
    await fsp.mkdir(path.join(testDir, device, 'actions'), { recursive: true });
    await fsp.mkdir(path.join(testDir, device, 'screenshots'), { recursive: true });
  }

  // Per-device action JSON files (sparse: only iterations where the device
  // was active get written under its folder).
  for (const step of result.steps) {
    if (!step.device || !step.stepJsonFile) continue;
    const absolutePath = path.join(
      testDir,
      '..',
      '..',
      ...step.stepJsonFile.split('/'),
    );
    // Writing through `testDir + ../../ + step.stepJsonFile` resolves to the
    // run root (testDir is `<runDir>/tests/<testId>`, so two parents up is
    // `<runDir>`). We already mkdir'd the actions folder above; the write is
    // safe.
    await fsp.writeFile(absolutePath, JSON.stringify(step, null, 2), 'utf-8');
  }

  // Merged test.json at the testDir root.
  await fsp.writeFile(
    path.join(testDir, 'test.json'),
    JSON.stringify(result, null, 2),
    'utf-8',
  );
}

async function writeRunManifest(params: {
  runDir: string;
  runId: string;
  startedAt: Date;
  testResults: TestResult[];
  multiDeviceConfig: MultiDeviceConfig;
  session: MultiDeviceTestSession;
  envName: string;
  platform: string;
  provider: string;
  modelName: string;
  selectors: string[];
  suitePath?: string;
  appOverridePath?: string;
  debug: boolean;
  maxIterations?: number;
  invokedCommand: 'test' | 'suite';
  tests: TestDefinition[];
  bindings: import('@finalrun/common').RuntimeBindings;
  target?: RunTarget;
}): Promise<void> {
  const startedAtIso = params.startedAt.toISOString();
  const completedAt = new Date().toISOString();
  const success = params.testResults.every((t) => t.success);
  const status: RunStatus = success ? 'success' : 'failure';
  const durationMs = Math.max(
    0,
    Date.parse(completedAt) - params.startedAt.getTime(),
  );

  const multiDevice: NonNullable<RunManifest['multiDevice']> = {
    devices: {},
  };
  for (const [key, def] of Object.entries(params.multiDeviceConfig.devices)) {
    const entry = params.session.devices.get(key);
    multiDevice.devices[key] = {
      platform: def.platform,
      app: def.app,
      hardwareName: entry?.hardwareName ?? key,
    };
  }

  const totalTests = params.testResults.length;
  const passedTests = params.testResults.filter((t) => t.success).length;
  const stepTotal = params.testResults.reduce(
    (sum, t) => sum + (t.counts?.executionStepsTotal ?? t.steps.length),
    0,
  );
  const stepPassed = params.testResults.reduce(
    (sum, t) =>
      sum +
      (t.counts?.executionStepsPassed ??
        t.steps.filter((s) => s.success).length),
    0,
  );

  const firstFailure = findFirstFailure(params.testResults);
  const firstDevice = Object.values(params.multiDeviceConfig.devices)[0];
  const appLabel = firstDevice?.app
    ? `${firstDevice.app} (multi-device)`
    : 'multi-device';
  const modelLabel = `${params.provider}/${params.modelName}`;

  const environment: EnvironmentRecord = {
    envName: params.envName,
    variables: params.bindings.variables,
    secretReferences: Object.keys(params.bindings.secrets).map((key) => ({
      key,
      envVar: key,
    })),
  };

  const manifest: RunManifest = {
    schemaVersion: 3,
    run: {
      runId: params.runId,
      success,
      status,
      startedAt: startedAtIso,
      completedAt,
      durationMs,
      envName: params.envName,
      platform: params.platform,
      model: {
        provider: params.provider,
        modelName: params.modelName,
        label: modelLabel,
      },
      app: {
        source: 'config',
        label: appLabel,
        identifier: firstDevice?.app,
        identifierKind:
          firstDevice?.platform === PLATFORM_ANDROID ? 'packageName' : 'bundleId',
        name: firstDevice?.app,
      },
      selectors: params.selectors,
      target: params.target,
      counts: {
        tests: {
          total: totalTests,
          passed: passedTests,
          failed: totalTests - passedTests,
        },
        steps: {
          total: stepTotal,
          passed: stepPassed,
          failed: stepTotal - stepPassed,
        },
      },
      firstFailure,
    },
    input: {
      environment,
      tests: params.tests,
      cli: {
        command: params.invokedCommand,
        selectors: params.selectors,
        suitePath: params.suitePath,
        requestedPlatform: params.platform,
        appOverridePath: params.appOverridePath,
        debug: params.debug,
        maxIterations: params.maxIterations,
      },
    },
    tests: params.testResults,
    paths: {
      runJson: 'run.json',
      summaryJson: 'summary.json',
      log: 'runner.log',
    },
    multiDevice,
  };

  await fsp.writeFile(
    path.join(params.runDir, 'run.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );
}

/** Find the earliest step failure across all tests for `run.firstFailure`. */
function findFirstFailure(testResults: TestResult[]): FirstFailure | undefined {
  for (const test of testResults) {
    const step = test.steps.find((s) => !s.success);
    if (step) {
      return {
        testId: test.testId,
        testName: test.testName,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        message: step.errorMessage ?? step.reason ?? 'step failed',
        screenshotPath: step.screenshotFile,
      };
    }
  }
  return undefined;
}

function addSigintHandler(handler: () => void): () => void {
  process.on('SIGINT', handler);
  return () => process.removeListener('SIGINT', handler);
}
