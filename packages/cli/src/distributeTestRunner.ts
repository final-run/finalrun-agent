import { spawn, type ChildProcess } from 'node:child_process';
import {
  Logger,
  type DeviceInventoryDiagnostic,
  type DeviceInventoryEntry,
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
import { buildChildArgv, resolveCliEntryScript } from './parallelTestRunner.js';

export interface DistributeTestRunParams {
  deviceSelectionIds: string[];
  baseOptions: TestRunnerOptions;
  stdinIsTTY: boolean;
}

export interface DistributeTestRunResult {
  success: boolean;
  exitCode: number;
}

function resolveExplicitDistributeDeviceIds(
  requested: string[],
  candidates: DeviceInventoryEntry[],
  diagnostics: DeviceInventoryDiagnostic[],
): string[] {
  const unique = [...new Set(requested.map((s) => s.trim()).filter((s) => s.length > 0))];
  if (unique.length < 1) {
    throw new PreExecutionFailureError({
      phase: 'setup',
      message:
        'Pass at least one --device <selectionId> for --distribute when stdin is not interactive, ' +
        'or omit --device to pick devices from the list.',
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
          `Device "${id}" is not available for --distribute ` +
          '(not runnable for this platform, or unknown selection id).',
        diagnostics,
        exitCode: 1,
      });
    }
  }
  return unique;
}

/**
 * Run each resolved test file on at most one device at a time; when a device
 * finishes a test, it picks the next from the queue (work-pool scheduling).
 */
export async function runDistributeTestInvocations(
  params: DistributeTestRunParams,
): Promise<DistributeTestRunResult> {
  const { checked } = await validateTestWorkspaceForExecution(params.baseOptions);
  const platform = checked.resolvedApp.platform;

  const testSelectors = checked.tests
    .map((t) => t.relativePath)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);

  if (testSelectors.length === 0) {
    throw new PreExecutionFailureError({
      phase: 'validation',
      message: 'No tests to run for --distribute (resolved list is empty).',
      exitCode: 1,
    });
  }

  const report = await detectFilteredInventoryReport({ platform }, testSessionDeps);
  const candidates = parallelSelectableEntries(report.entries);

  let deviceIds: string[];
  if (params.deviceSelectionIds.length > 0) {
    deviceIds = resolveExplicitDistributeDeviceIds(
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
      minimumDevices: 1,
      mode: 'distribute',
    });
    deviceIds = picked.map((e) => e.selectionId);
  }

  const deviceSlotIndex = new Map(deviceIds.map((id, i) => [id, i]));
  const cliScript = resolveCliEntryScript();
  const cwd = params.baseOptions.cwd ?? process.cwd();
  const children: ChildProcess[] = [];

  const onSigInt = (): void => {
    for (const child of children) {
      child.kill('SIGINT');
    }
  };
  process.on('SIGINT', onSigInt);

  const queue = [...testSelectors];
  const busyDevices = new Set<string>();
  let activeJobCount = 0;
  let anyFailure = false;
  let sawAbort = false;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finishOk = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };
      const finishErr = (err: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        reject(err);
      };

      const tryFinish = (): void => {
        if (queue.length === 0 && activeJobCount === 0) {
          finishOk();
        }
      };

      const pump = (): void => {
        if (settled) {
          return;
        }
        for (const deviceId of deviceIds) {
          if (busyDevices.has(deviceId)) {
            continue;
          }
          const assignment = queue.shift();
          if (assignment === undefined) {
            break;
          }
          busyDevices.add(deviceId);
          activeJobCount += 1;

          const slot = deviceSlotIndex.get(deviceId) ?? 0;
          const childArgv = buildChildArgv({
            cliScript,
            invokedCommand: 'test',
            selectors: [assignment],
            suitePath: undefined,
            options: params.baseOptions,
            deviceId,
          });
          const child = spawn(process.execPath, childArgv, {
            cwd,
            stdio: 'inherit',
            env: {
              ...process.env,
              FINALRUN_GRPC_PORT_SLOT: String(slot),
            },
          });
          children.push(child);

          /**
           * Node may emit both `error` and `close` when spawn/kill fails. Counting the
           * slot twice makes `activeJobCount` wrong, `tryFinish` can resolve early while
           * work remains, and the pool stops scheduling (one device looks idle forever).
           */
          let slotReleased = false;
          const releaseSlot = (): void => {
            if (slotReleased) {
              return;
            }
            slotReleased = true;
            busyDevices.delete(deviceId);
            activeJobCount -= 1;
          };

          child.on('error', (err) => {
            releaseSlot();
            anyFailure = true;
            queue.push(assignment);
            Logger.w(
              `Distribute: failed to spawn subprocess for ${assignment} on ${deviceId} — ` +
                `will retry later. ${err instanceof Error ? err.message : String(err)}`,
            );
            if (!settled) {
              pump();
              tryFinish();
            }
          });

          child.on('close', (code) => {
            releaseSlot();
            const exit = code ?? 1;
            if (exit === 130) {
              sawAbort = true;
            } else if (exit !== 0) {
              anyFailure = true;
            }
            if (!settled) {
              pump();
              tryFinish();
            }
          });
        }
        tryFinish();
      };

      pump();
    });

    await rebuildRunIndex(checked.workspace.artifactsDir);

    const exitCode = sawAbort ? 130 : anyFailure ? 1 : 0;
    return { success: exitCode === 0, exitCode };
  } finally {
    process.removeListener('SIGINT', onSigInt);
  }
}
