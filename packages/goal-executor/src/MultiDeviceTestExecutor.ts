// Multi-device test executor using LOCKSTEP per-step execution.
//
// Architecture: iterate through setup → steps → expected_state in order.
// For each step, run the existing single-device TestExecutor against the
// step's target device with a narrow sub-goal limited to that one step.
//
// This prevents the LLM from skipping devices or fabricating completion —
// the executor controls step progression and device routing, the LLM only
// decides tactical "how" for each step.

import {
  DeviceAgent,
  Logger,
  type MultiDeviceStep,
  type MultiDeviceParallelBlock,
  type MultiDevicePhaseItem,
  type MultiDeviceTestDefinition,
  type RuntimeBindings,
} from '@finalrun/common';
import { isParallelBlock } from '@finalrun/common';
import { AIAgent } from './ai/AIAgent.js';
import {
  TestExecutor,
  type TestExecutionResult,
} from './TestExecutor.js';

// ============================================================================
// Types
// ============================================================================

export interface MultiDeviceExecutorConfig {
  test: MultiDeviceTestDefinition;
  platform: string;
  /** role → connected DeviceAgent */
  devices: Map<string, DeviceAgent>;
  /** role → human-friendly device name, e.g. "Pixel_10" */
  deviceDisplayNames: Map<string, string>;
  /** role → app package identifier (mirrors test.devices) */
  deviceApps: Map<string, string>;
  aiAgent: AIAgent;
  /** Per-step iteration budget. Default 40. */
  maxIterationsPerStep?: number;
  runtimeBindings?: RuntimeBindings;
  abortSignal?: AbortSignal;
}

type StepPhase = 'setup' | 'steps' | 'expected_state';

interface PhasedStep {
  phase: StepPhase;
  phaseIndex: number; // 1-based index within the phase
  step: MultiDeviceStep;
}

interface PhasedItem {
  phase: StepPhase;
  phaseIndex: number; // 1-based index into the phase's top-level item list
  item: MultiDevicePhaseItem;
}

interface CompletedStepRecord {
  phase: StepPhase;
  device: string;
  action: string;
}

export interface MultiDeviceStepResult {
  phase: StepPhase;
  phaseIndex: number;
  device: string;
  deviceDisplayName: string;
  action: string;
  success: boolean;
  status: 'success' | 'failure' | 'aborted';
  message: string;
  iterations: number;
  startedAt: string;
  completedAt: string;
}

export interface MultiDeviceTestExecutionResult {
  success: boolean;
  status: 'success' | 'failure' | 'aborted';
  message: string;
  analysis?: string;
  platform: string;
  startedAt: string;
  completedAt: string;
  steps: MultiDeviceStepResult[];
  totalIterations: number;
  /**
   * Final accumulated `remember` array — facts the planner kept across
   * every step on every device during the run. Useful for debugging.
   */
  remember: string[];
}

const VARIABLE_REFERENCE_PATTERN = /\$\{variables\.([A-Za-z0-9_-]+)\}/g;

// ============================================================================
// MultiDeviceTestExecutor
// ============================================================================

export class MultiDeviceTestExecutor {
  private _config: MultiDeviceExecutorConfig;
  private _stepResults: MultiDeviceStepResult[] = [];
  private _completedSteps: CompletedStepRecord[] = [];
  private _totalIterations = 0;
  private _abortRequested = false;
  /**
   * Shared `remember` array threaded across every per-step TestExecutor.
   * Allows facts captured on device A (e.g. a pairing code) to be used on
   * device B in a later step.
   */
  private _sharedRemember: string[] = [];

  constructor(config: MultiDeviceExecutorConfig) {
    this._config = config;
  }

  abort(): void {
    this._abortRequested = true;
  }

  async executeGoal(): Promise<MultiDeviceTestExecutionResult> {
    const startedAt = new Date().toISOString();
    const { test } = this._config;

    const phasedItems: PhasedItem[] = [
      ...test.setup.map((item, i) => ({
        phase: 'setup' as const,
        phaseIndex: i + 1,
        item,
      })),
      ...test.steps.map((item, i) => ({
        phase: 'steps' as const,
        phaseIndex: i + 1,
        item,
      })),
      ...test.expected_state.map((item, i) => ({
        phase: 'expected_state' as const,
        phaseIndex: i + 1,
        item,
      })),
    ];

    this._printTestBanner(test, phasedItems);

    for (const [index, phased] of phasedItems.entries()) {
      if (this._abortRequested || this._config.abortSignal?.aborted) {
        return this._buildResult({
          startedAt,
          success: false,
          status: 'aborted',
          message: 'Multi-device test execution aborted',
        });
      }

      if (isParallelBlock(phased.item)) {
        const outcome = await this._runParallelBlock(
          {
            phase: phased.phase,
            phaseIndex: phased.phaseIndex,
            block: phased.item,
          },
          index + 1,
          phasedItems.length,
        );
        if (!outcome.success) {
          return this._buildResult({
            startedAt,
            success: false,
            status: outcome.status,
            message: outcome.message,
            analysis: outcome.message,
          });
        }
        continue;
      }

      const step = phased.item;
      const stepResult = await this._runPhasedStep(
        { phase: phased.phase, phaseIndex: phased.phaseIndex, step },
        index + 1,
        phasedItems.length,
      );
      this._stepResults.push(stepResult);
      this._totalIterations += stepResult.iterations;

      if (!stepResult.success) {
        return this._buildResult({
          startedAt,
          success: false,
          status: stepResult.status,
          message: `[${stepResult.phase}][${stepResult.device}] ${stepResult.action} → ${stepResult.message}`,
          analysis: stepResult.message,
        });
      }

      this._completedSteps.push({
        phase: phased.phase,
        device: step.device,
        action: step.action,
      });
    }

    return this._buildResult({
      startedAt,
      success: true,
      status: 'success',
      message: 'All multi-device test steps completed successfully',
      analysis: this._buildSuccessAnalysis(),
    });
  }

  // ---------- Step execution ----------

  private async _runPhasedStep(
    phased: PhasedStep,
    globalIndex: number,
    globalTotal: number,
  ): Promise<MultiDeviceStepResult> {
    const { phase, step } = phased;
    const displayName =
      this._config.deviceDisplayNames.get(step.device) ?? step.device;
    const app = this._config.deviceApps.get(step.device) ?? '(unknown app)';
    const startedAt = new Date().toISOString();

    this._printStepHeader({
      globalIndex,
      globalTotal,
      phase,
      phaseIndex: phased.phaseIndex,
      device: step.device,
      displayName,
      action: step.action,
    });

    const agent = this._config.devices.get(step.device);
    if (!agent) {
      const message = `No connected device for role "${step.device}"`;
      Logger.e(message);
      return {
        phase,
        phaseIndex: phased.phaseIndex,
        device: step.device,
        deviceDisplayName: displayName,
        action: step.action,
        success: false,
        status: 'failure',
        message,
        iterations: 0,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const subGoal = this._buildSubGoal({
      phase,
      step,
      deviceRole: step.device,
      deviceDisplayName: displayName,
      deviceApp: app,
    });

    const executor = new TestExecutor({
      goal: subGoal,
      platform: this._config.platform,
      agent,
      aiAgent: this._config.aiAgent,
      appIdentifier: app,
      runtimeBindings: this._config.runtimeBindings,
      maxIterations: this._config.maxIterationsPerStep ?? 40,
      // Seed planner with everything remembered across prior steps & devices.
      initialRemember: [...this._sharedRemember],
      // Prefix every planner/grounder log line so it's obvious which device
      // and which step is firing in multi-device runs.
      logContext: `${step.device}(${displayName}) ${phase}-step=${phased.phaseIndex}`,
    });

    let result: TestExecutionResult;
    try {
      result = await executor.executeGoal();
      // Persist whatever the planner kept in `remember` so the NEXT step
      // (possibly on a different device) inherits it.
      if (result.remember && result.remember.length > 0) {
        this._sharedRemember = result.remember;
        Logger.d(
          `[shared remember] ${this._sharedRemember.length} fact(s) carried forward after step on ${step.device}: ${JSON.stringify(this._sharedRemember).slice(0, 200)}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      Logger.e(
        `Step [${phase}][${step.device} (${displayName})] threw: ${message}`,
      );
      return {
        phase,
        phaseIndex: phased.phaseIndex,
        device: step.device,
        deviceDisplayName: displayName,
        action: step.action,
        success: false,
        status: 'failure',
        message,
        iterations: 0,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }

    const completedAt = new Date().toISOString();
    const stepResult: MultiDeviceStepResult = {
      phase,
      phaseIndex: phased.phaseIndex,
      device: step.device,
      deviceDisplayName: displayName,
      action: step.action,
      success: result.success,
      status: result.status,
      message: result.message,
      iterations: result.totalIterations,
      startedAt,
      completedAt,
    };

    this._printStepFooter(stepResult);
    return stepResult;
  }

  // ---------- Parallel block execution ----------

  private async _runParallelBlock(
    phased: {
      phase: StepPhase;
      phaseIndex: number;
      block: MultiDeviceParallelBlock;
    },
    globalIndex: number,
    globalTotal: number,
  ): Promise<{
    success: boolean;
    status: 'success' | 'failure' | 'aborted';
    message: string;
  }> {
    const { phase, block } = phased;
    this._printBlockHeader(globalIndex, globalTotal, phase, phased.phaseIndex, block);

    // Snapshot shared memory once. Every lane seeds its planner with this
    // snapshot; mid-block discoveries are merged after the block completes.
    const snapshot = [...this._sharedRemember];

    // Shared failure flag so siblings can fail-fast.
    let firstFailure: MultiDeviceStepResult | undefined;
    const allExecutors: TestExecutor[] = [];
    const abortAllLanes = (): void => {
      for (const ex of allExecutors) {
        try {
          ex.abort();
        } catch {
          // best effort
        }
      }
    };

    type LaneOutcome = {
      laneDevice: string;
      stepResults: MultiDeviceStepResult[];
      finalRemember: string[];
    };

    const laneOutcomes = await Promise.all(
      block.lanes.map((lane): Promise<LaneOutcome> =>
        this._runSingleLane({
          lane,
          phase,
          blockIndex: phased.phaseIndex,
          globalIndex,
          globalTotal,
          snapshot,
          onFailure: (failed) => {
            if (!firstFailure) {
              firstFailure = failed;
              abortAllLanes();
            }
          },
          registerExecutor: (ex) => {
            allExecutors.push(ex);
          },
        }),
      ),
    );

    // Persist step results in lane order (primary, secondary, ...).
    for (const outcome of laneOutcomes) {
      for (const r of outcome.stepResults) {
        this._stepResults.push(r);
        this._totalIterations += r.iterations;
        if (r.success) {
          this._completedSteps.push({
            phase,
            device: r.device,
            action: r.action,
          });
        }
      }
    }

    // Merge remember: union across lanes, preserving first-seen order.
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const outcome of laneOutcomes) {
      for (const fact of outcome.finalRemember) {
        if (!seen.has(fact)) {
          seen.add(fact);
          merged.push(fact);
        }
      }
    }
    this._sharedRemember = merged;
    Logger.d(
      `[shared remember] ${this._sharedRemember.length} fact(s) after parallel block (${block.lanes.map((l) => l.device).join(' || ')})`,
    );

    this._printBlockFooter(globalIndex, globalTotal, phase, phased.phaseIndex, laneOutcomes, !!firstFailure);

    if (firstFailure) {
      return {
        success: false,
        status: firstFailure.status,
        message: `[${phase} parallel block #${phased.phaseIndex}][${firstFailure.device}] ${firstFailure.action} → ${firstFailure.message}`,
      };
    }

    return { success: true, status: 'success', message: '' };
  }

  private async _runSingleLane(params: {
    lane: { device: string; actions: string[] };
    phase: StepPhase;
    blockIndex: number;
    globalIndex: number;
    globalTotal: number;
    snapshot: string[];
    onFailure: (failed: MultiDeviceStepResult) => void;
    registerExecutor: (ex: TestExecutor) => void;
  }): Promise<{
    laneDevice: string;
    stepResults: MultiDeviceStepResult[];
    finalRemember: string[];
  }> {
    const { lane, phase, blockIndex, snapshot } = params;
    const displayName =
      this._config.deviceDisplayNames.get(lane.device) ?? lane.device;
    const app = this._config.deviceApps.get(lane.device) ?? '(unknown app)';
    const agent = this._config.devices.get(lane.device);

    const stepResults: MultiDeviceStepResult[] = [];
    let laneRemember = [...snapshot];
    const laneCompletedActions: CompletedStepRecord[] = [];

    if (!agent) {
      const failure: MultiDeviceStepResult = {
        phase,
        phaseIndex: blockIndex,
        device: lane.device,
        deviceDisplayName: displayName,
        action: lane.actions[0] ?? '(no actions)',
        success: false,
        status: 'failure',
        message: `No connected device for role "${lane.device}"`,
        iterations: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      stepResults.push(failure);
      params.onFailure(failure);
      return {
        laneDevice: lane.device,
        stepResults,
        finalRemember: laneRemember,
      };
    }

    for (let i = 0; i < lane.actions.length; i++) {
      if (this._abortRequested || this._config.abortSignal?.aborted) {
        break;
      }

      const action = lane.actions[i]!;
      const startedAt = new Date().toISOString();
      this._printLaneStepHeader({
        phase,
        blockIndex,
        laneDevice: lane.device,
        displayName,
        actionIndex: i + 1,
        totalInLane: lane.actions.length,
        action,
      });

      const subGoal = this._buildSubGoal({
        phase,
        step: { device: lane.device, action },
        deviceRole: lane.device,
        deviceDisplayName: displayName,
        deviceApp: app,
        extraCompletedSteps: laneCompletedActions,
        isParallelLane: true,
      });

      const executor = new TestExecutor({
        goal: subGoal,
        platform: this._config.platform,
        agent,
        aiAgent: this._config.aiAgent,
        appIdentifier: app,
        runtimeBindings: this._config.runtimeBindings,
        maxIterations: this._config.maxIterationsPerStep ?? 40,
        initialRemember: [...laneRemember],
        logContext: `${lane.device}(${displayName}) ${phase}-parallel-block=${blockIndex} lane-step=${i + 1}`,
      });
      params.registerExecutor(executor);

      let result: TestExecutionResult;
      try {
        result = await executor.executeGoal();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failure: MultiDeviceStepResult = {
          phase,
          phaseIndex: blockIndex,
          device: lane.device,
          deviceDisplayName: displayName,
          action,
          success: false,
          status: 'failure',
          message,
          iterations: 0,
          startedAt,
          completedAt: new Date().toISOString(),
        };
        stepResults.push(failure);
        this._printStepFooter(failure);
        params.onFailure(failure);
        break;
      }

      if (result.remember && result.remember.length > 0) {
        laneRemember = result.remember;
      }

      const stepResult: MultiDeviceStepResult = {
        phase,
        phaseIndex: blockIndex,
        device: lane.device,
        deviceDisplayName: displayName,
        action,
        success: result.success,
        status: result.status,
        message: result.message,
        iterations: result.totalIterations,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      stepResults.push(stepResult);
      this._printStepFooter(stepResult);

      if (!result.success) {
        params.onFailure(stepResult);
        break;
      }

      laneCompletedActions.push({
        phase,
        device: lane.device,
        action,
      });
    }

    return {
      laneDevice: lane.device,
      stepResults,
      finalRemember: laneRemember,
    };
  }

  // ---------- Sub-goal builder ----------

  private _buildSubGoal(params: {
    phase: StepPhase;
    step: MultiDeviceStep;
    deviceRole: string;
    deviceDisplayName: string;
    deviceApp: string;
    /**
     * Extra completed actions to prepend to the planner context — used by
     * parallel-lane execution so the lane's own earlier steps are visible.
     * Sibling lanes' progress is intentionally NOT included.
     */
    extraCompletedSteps?: CompletedStepRecord[];
    /**
     * Hint to the planner that the current step is running inside a parallel
     * block alongside other devices. Used to set expectations around
     * cross-device reads.
     */
    isParallelLane?: boolean;
  }): string {
    const { phase, step, deviceRole, deviceDisplayName, deviceApp } = params;
    const bindings = this._config.runtimeBindings;

    const sections: string[] = [
      `Test Name: ${this._config.test.name}`,
      `Device: ${deviceRole} (${deviceDisplayName}) running ${deviceApp}`,
    ];

    if (this._config.test.description) {
      sections.push(
        `Description: ${this._interpolate(this._config.test.description, bindings)}`,
      );
    }

    // Provide context about what's already been done on this and other devices.
    const combinedCompleted = [
      ...this._completedSteps,
      ...(params.extraCompletedSteps ?? []),
    ];
    if (combinedCompleted.length > 0) {
      const priorLines = combinedCompleted.map(
        (cs, i) =>
          `${i + 1}. [${cs.phase}][${cs.device}] ${this._interpolate(cs.action, bindings)}`,
      );
      sections.push(
        [
          'Previously completed steps across all devices (DO NOT re-do these):',
          ...priorLines,
        ].join('\n'),
      );
    }

    const actionText = this._interpolate(step.action, bindings);

    if (phase === 'expected_state') {
      // Observation-only phase. Keep Steps empty so the single-device planner
      // enters Phase 3 (Expected State) on the first turn.
      sections.push(`Steps:\n(none — observation only for this sub-run)`);
      sections.push(`Expected State (verify on the ${deviceRole} device):\n- ${actionText}`);
      sections.push(
        [
          'Execution Rules:',
          `- You are in Phase 3 (Expected State) on the ${deviceRole} (${deviceDisplayName}) device.`,
          '- OBSERVE ONLY. Do not tap, type, or scroll.',
          '- If the condition is met, emit status: Success.',
          '- If the condition is not met, emit status: Failure with an Expected vs Actual analysis.',
          '- Treat any ${secrets.*} placeholder as a logical token. Pass verbatim.',
        ].join('\n'),
      );
    } else {
      const phaseLabel = phase === 'setup' ? 'Setup' : 'Steps';
      sections.push(`${phaseLabel}:\n1. ${actionText}`);
      const rules = [
        'Execution Rules:',
        `- You are operating on the ${deviceRole} (${deviceDisplayName}) device only.`,
        `- Execute ONLY the single step listed above.`,
        `- When the step is complete, emit status: Success immediately.`,
        `- If the step cannot be completed, emit status: Failure with analysis.`,
        `- Do NOT attempt other actions or re-do previously completed steps.`,
        `- Treat any \${secrets.*} placeholder as a logical token. Pass verbatim.`,
      ];
      if (params.isParallelLane) {
        rules.push(
          `- This step runs INSIDE a parallel block alongside other devices. Other lanes' in-progress work is not visible to you yet; only rely on work listed above as "previously completed".`,
        );
      }
      sections.push(rules.join('\n'));
    }

    return sections.join('\n\n');
  }

  // ---------- Formatting helpers ----------

  private _printTestBanner(
    test: MultiDeviceTestDefinition,
    phasedItems: PhasedItem[],
  ): void {
    Logger.i('');
    Logger.i('━'.repeat(70));
    Logger.i(`Multi-device lockstep execution: ${test.name}`);
    const deviceList = test.devices
      .map((d) => {
        const displayName =
          this._config.deviceDisplayNames.get(d.role) ?? d.role;
        return `${d.role} (${displayName}) → ${d.app}`;
      })
      .join('\n  ');
    Logger.i(`  ${deviceList}`);

    // Count items AND underlying actions so users can see both the top-level
    // shape (sequential steps + parallel blocks) and total workload.
    const itemCounts = this._summarizeItemCounts(phasedItems);
    Logger.i(
      `Top-level items: ${phasedItems.length} ` +
        `(setup:${test.setup.length}, steps:${test.steps.length}, expected_state:${test.expected_state.length}) ` +
        `— parallel-blocks:${itemCounts.parallelBlocks}, sequential:${itemCounts.sequentialSteps}, total-actions:${itemCounts.totalActions}`,
    );
    Logger.i('━'.repeat(70));
  }

  private _summarizeItemCounts(items: PhasedItem[]): {
    parallelBlocks: number;
    sequentialSteps: number;
    totalActions: number;
  } {
    let parallelBlocks = 0;
    let sequentialSteps = 0;
    let totalActions = 0;
    for (const { item } of items) {
      if (isParallelBlock(item)) {
        parallelBlocks += 1;
        for (const lane of item.lanes) {
          totalActions += lane.actions.length;
        }
      } else {
        sequentialSteps += 1;
        totalActions += 1;
      }
    }
    return { parallelBlocks, sequentialSteps, totalActions };
  }

  private _printStepHeader(params: {
    globalIndex: number;
    globalTotal: number;
    phase: StepPhase;
    phaseIndex: number;
    device: string;
    displayName: string;
    action: string;
  }): void {
    const phaseLabel = params.phase.toUpperCase();
    Logger.i('');
    Logger.i('─'.repeat(70));
    Logger.i(
      `\x1b[36m▶ [${params.globalIndex}/${params.globalTotal}] ${phaseLabel} step ${params.phaseIndex} — on ${params.device} (${params.displayName})\x1b[0m`,
    );
    Logger.i(`  Action: ${params.action}`);
    Logger.i('─'.repeat(70));
  }

  private _printStepFooter(result: MultiDeviceStepResult): void {
    const prefix = `[${result.device} (${result.deviceDisplayName})]`;
    if (result.success) {
      Logger.i(
        `\x1b[32m✓ ${prefix} ${result.phase} step ${result.phaseIndex} passed\x1b[0m (${result.iterations} iterations)`,
      );
    } else {
      Logger.w(
        `\x1b[31m✗ ${prefix} ${result.phase} step ${result.phaseIndex} failed\x1b[0m: ${result.message}`,
      );
    }
  }

  private _printBlockHeader(
    globalIndex: number,
    globalTotal: number,
    phase: StepPhase,
    blockIndex: number,
    block: MultiDeviceParallelBlock,
  ): void {
    const phaseLabel = phase.toUpperCase();
    const laneSummary = block.lanes
      .map((lane) => {
        const displayName =
          this._config.deviceDisplayNames.get(lane.device) ?? lane.device;
        return `${lane.device}(${displayName}):${lane.actions.length} actions`;
      })
      .join(' || ');
    Logger.i('');
    Logger.i('═'.repeat(70));
    Logger.i(
      `\x1b[35m▶▶ [${globalIndex}/${globalTotal}] ${phaseLabel} PARALLEL block ${blockIndex} — ${block.lanes.length} lanes\x1b[0m`,
    );
    Logger.i(`  Lanes: ${laneSummary}`);
    Logger.i('═'.repeat(70));
  }

  private _printBlockFooter(
    globalIndex: number,
    globalTotal: number,
    phase: StepPhase,
    blockIndex: number,
    laneOutcomes: Array<{
      laneDevice: string;
      stepResults: MultiDeviceStepResult[];
    }>,
    failed: boolean,
  ): void {
    const laneStats = laneOutcomes
      .map((outcome) => {
        const total = outcome.stepResults.length;
        const ok = outcome.stepResults.filter((r) => r.success).length;
        return `${outcome.laneDevice}: ${ok}/${total}`;
      })
      .join(', ');
    const phaseLabel = phase.toUpperCase();
    if (failed) {
      Logger.w(
        `\x1b[31m✗ [${globalIndex}/${globalTotal}] ${phaseLabel} PARALLEL block ${blockIndex} FAILED\x1b[0m — lane stats: ${laneStats}`,
      );
    } else {
      Logger.i(
        `\x1b[32m✓ [${globalIndex}/${globalTotal}] ${phaseLabel} PARALLEL block ${blockIndex} passed\x1b[0m — lane stats: ${laneStats}`,
      );
    }
  }

  private _printLaneStepHeader(params: {
    phase: StepPhase;
    blockIndex: number;
    laneDevice: string;
    displayName: string;
    actionIndex: number;
    totalInLane: number;
    action: string;
  }): void {
    Logger.i('');
    Logger.i('─'.repeat(70));
    Logger.i(
      `\x1b[36m▶ [${params.laneDevice} (${params.displayName})] ${params.phase.toUpperCase()} parallel-block ${params.blockIndex} lane-step ${params.actionIndex}/${params.totalInLane}\x1b[0m`,
    );
    Logger.i(`  Action: ${params.action}`);
    Logger.i('─'.repeat(70));
  }

  // ---------- Result building ----------

  private _buildResult(params: {
    startedAt: string;
    success: boolean;
    status: 'success' | 'failure' | 'aborted';
    message: string;
    analysis?: string;
  }): MultiDeviceTestExecutionResult {
    return {
      success: params.success,
      status: params.status,
      message: params.message,
      analysis: params.analysis,
      platform: this._config.platform,
      startedAt: params.startedAt,
      completedAt: new Date().toISOString(),
      remember: [...this._sharedRemember],
      steps: this._stepResults,
      totalIterations: this._totalIterations,
    };
  }

  private _buildSuccessAnalysis(): string {
    const byPhase = this._stepResults.reduce<Record<string, number>>(
      (acc, s) => {
        acc[s.phase] = (acc[s.phase] ?? 0) + 1;
        return acc;
      },
      {},
    );
    return `Completed ${this._stepResults.length} steps across devices — setup: ${byPhase['setup'] ?? 0}, steps: ${byPhase['steps'] ?? 0}, expected_state: ${byPhase['expected_state'] ?? 0}.`;
  }

  private _interpolate(value: string, bindings: RuntimeBindings | undefined): string {
    if (!bindings) {
      return value;
    }
    return value.replace(VARIABLE_REFERENCE_PATTERN, (_match, key: string) => {
      const variableValue = bindings.variables[key];
      return variableValue === undefined
        ? `\${variables.${key}}`
        : String(variableValue);
    });
  }
}
