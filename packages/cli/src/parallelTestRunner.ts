import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type {
  DeviceInventoryDiagnostic,
  DeviceInventoryEntry,
} from '@finalrun/common';
import {
  detectFilteredInventoryReport,
  testSessionDeps,
} from './sessionRunner.js';
import {
  parallelSelectableEntries,
  promptForParallelDeviceSelection,
} from './deviceInventoryPresenter.js';
import {
  PreExecutionFailureError,
  validateTestWorkspaceForExecution,
  type TestRunnerOptions,
} from './testRunner.js';
import { rebuildRunIndex } from './runIndex.js';

const MIN_PARALLEL_DEVICES = 2;

export interface ParallelTestRunParams {
  invokedCommand: 'test' | 'suite';
  selectors: string[];
  suitePath?: string;
  deviceSelectionIds: string[];
  baseOptions: TestRunnerOptions;
  stdinIsTTY: boolean;
}

export interface ParallelTestRunResult {
  success: boolean;
  exitCode: number;
}

export function resolveCliEntryScript(): string {
  const argv1 = process.argv[1];
  if (typeof argv1 === 'string' && argv1.length > 0) {
    return path.resolve(argv1);
  }
  return path.join(__dirname, '../bin/finalrun.js');
}

function pushIfDefined(args: string[], flag: string, value?: string): void {
  if (value !== undefined && value.length > 0) {
    args.push(flag, value);
  }
}

/** Build `node <cli> …` argv for a single finalrun test/suite subprocess (used by --parallel and --distribute). */
export function buildChildArgv(params: {
  cliScript: string;
  invokedCommand: 'test' | 'suite';
  selectors: string[];
  suitePath?: string;
  options: TestRunnerOptions;
  deviceId: string;
}): string[] {
  const argv = [params.cliScript, params.invokedCommand];
  if (params.invokedCommand === 'suite' && params.suitePath) {
    argv.push(params.suitePath);
  } else {
    argv.push(...params.selectors);
  }
  const o = params.options;
  pushIfDefined(argv, '--env', o.envName);
  pushIfDefined(argv, '--platform', o.platform);
  pushIfDefined(argv, '--app', o.appPath);
  pushIfDefined(argv, '--api-key', o.apiKey);
  if (o.provider && o.modelName) {
    argv.push('--model', `${o.provider}/${o.modelName}`);
  }
  if (o.debug) {
    argv.push('--debug');
  }
  if (o.maxIterations !== undefined) {
    argv.push('--max-iterations', String(o.maxIterations));
  }
  argv.push('--device', params.deviceId);
  return argv;
}

function resolveExplicitParallelDeviceIds(
  requested: string[],
  candidates: DeviceInventoryEntry[],
  diagnostics: DeviceInventoryDiagnostic[],
): string[] {
  const unique = [...new Set(requested.map((s) => s.trim()).filter((s) => s.length > 0))];
  if (unique.length < MIN_PARALLEL_DEVICES) {
    throw new PreExecutionFailureError({
      phase: 'setup',
      message:
        `--parallel needs at least ${MIN_PARALLEL_DEVICES} distinct devices. ` +
        `Pass multiple --device <selectionId> flags (one per device).`,
      diagnostics,
      exitCode: 1,
    });
  }
  const byId = new Map(candidates.map((e) => [e.selectionId, e]));
  for (const id of unique) {
    if (!byId.has(id)) {
      throw new PreExecutionFailureError({
        phase: 'setup',
        message:
          `Device "${id}" is not available for a parallel run ` +
          '(not runnable for this platform, or unknown selection id).',
        diagnostics,
        exitCode: 1,
      });
    }
  }
  return unique;
}

/**
 * Validate once, pick N devices, then spawn one CLI subprocess per device (each runs the same tests).
 */
export async function runParallelTestInvocations(
  params: ParallelTestRunParams,
): Promise<ParallelTestRunResult> {
  const { checked } = await validateTestWorkspaceForExecution(params.baseOptions);
  const platform = checked.resolvedApp.platform;

  const report = await detectFilteredInventoryReport({ platform }, testSessionDeps);
  const candidates = parallelSelectableEntries(report.entries);

  let deviceIds: string[];
  if (params.deviceSelectionIds.length > 0) {
    deviceIds = resolveExplicitParallelDeviceIds(
      params.deviceSelectionIds,
      candidates,
      report.diagnostics,
    );
  } else {
    const picked = await promptForParallelDeviceSelection({
      entries: report.entries,
      io: {
        input: process.stdin,
        output: process.stdout,
        isTTY: params.stdinIsTTY,
      },
      minimumDevices: MIN_PARALLEL_DEVICES,
      mode: 'parallel',
    });
    deviceIds = picked.map((e) => e.selectionId);
  }

  const cliScript = resolveCliEntryScript();
  const cwd = params.baseOptions.cwd ?? process.cwd();
  const children: ChildProcess[] = [];

  const onSigInt = (): void => {
    for (const child of children) {
      child.kill('SIGINT');
    }
  };
  process.on('SIGINT', onSigInt);

  try {
    const exitCodes = await Promise.all(
      deviceIds.map(
        (deviceId, grpcPortSlot) =>
          new Promise<number>((resolve, reject) => {
            const childArgv = buildChildArgv({
              cliScript,
              invokedCommand: params.invokedCommand,
              selectors: params.selectors,
              suitePath: params.suitePath,
              options: params.baseOptions,
              deviceId,
            });
            const child = spawn(process.execPath, childArgv, {
              cwd,
              stdio: 'inherit',
              env: {
                ...process.env,
                // Each subprocess picks gRPC adb-forward host ports in a different
                // order so concurrent processes do not race on the same port.
                FINALRUN_GRPC_PORT_SLOT: String(grpcPortSlot),
              },
            });
            children.push(child);
            child.on('error', reject);
            child.on('close', (code) => resolve(code ?? 1));
          }),
      ),
    );

    const exitCode = exitCodes.some((c) => c === 130)
      ? 130
      : exitCodes.every((c) => c === 0)
        ? 0
        : 1;

    await rebuildRunIndex(checked.workspace.artifactsDir);

    return { success: exitCode === 0, exitCode };
  } finally {
    process.removeListener('SIGINT', onSigInt);
  }
}