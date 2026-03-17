import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeviceActionRequest,
  DeviceNodeResponse,
  GetScreenshotAndHierarchyAction,
  Logger,
  LogLevel,
  PLANNER_ACTION_TAP,
  PLANNER_ACTION_COMPLETED,
} from '@finalrun/common';
import type { Agent } from '@finalrun/common';
import type { AIAgent, PlannerResponse } from './ai/AIAgent.js';
import { HeadlessGoalExecutor } from './HeadlessGoalExecutor.js';

function createAgent(
  responses: DeviceNodeResponse[],
): Agent {
  let responseIndex = 0;

  return {
    async setUp() {
      return new DeviceNodeResponse({ success: true });
    },
    async executeAction(request: DeviceActionRequest) {
      assert.equal(request.action instanceof GetScreenshotAndHierarchyAction, true);
      const response =
        responses[responseIndex] ??
        responses[responses.length - 1];
      responseIndex += 1;
      return response;
    },
    isConnected() {
      return true;
    },
    getDeviceInfo() {
      return {
        id: 'emulator-5554',
        deviceUUID: 'device-1',
        isAndroid: true,
        sdkVersion: 34,
        getPlatform() {
          return 'android';
        },
      };
    },
    async closeConnection() {
      return undefined;
    },
    killDriver() {
      return undefined;
    },
    setApiKey() {
      return undefined;
    },
    getId() {
      return 'device-1';
    },
    listenForDeviceDisconnection() {
      return undefined;
    },
    clearListener() {
      return undefined;
    },
    uninstallDriver() {
      return undefined;
    },
  } as unknown as Agent;
}

function createAiAgent(
  planImpl: () => Promise<PlannerResponse>,
): AIAgent {
  return {
    plan: planImpl,
  } as unknown as AIAgent;
}

function createGoalAgent(params: {
  captureResponses: DeviceNodeResponse[];
  executedActions?: unknown[];
}): Agent {
  let responseIndex = 0;

  return {
    async setUp() {
      return new DeviceNodeResponse({ success: true });
    },
    async executeAction(request: DeviceActionRequest) {
      if (request.action instanceof GetScreenshotAndHierarchyAction) {
        const response =
          params.captureResponses[responseIndex] ??
          params.captureResponses[params.captureResponses.length - 1];
        responseIndex += 1;
        return response;
      }

      params.executedActions?.push(request.action);
      return new DeviceNodeResponse({ success: true });
    },
    isConnected() {
      return true;
    },
    getDeviceInfo() {
      return {
        id: 'emulator-5554',
        deviceUUID: 'device-1',
        isAndroid: true,
        sdkVersion: 34,
        getPlatform() {
          return 'android';
        },
      };
    },
    async closeConnection() {
      return undefined;
    },
    killDriver() {
      return undefined;
    },
    setApiKey() {
      return undefined;
    },
    getId() {
      return 'device-1';
    },
    listenForDeviceDisconnection() {
      return undefined;
    },
    clearListener() {
      return undefined;
    },
    uninstallDriver() {
      return undefined;
    },
  } as unknown as Agent;
}

test('HeadlessGoalExecutor continues after a transient capture failure and recovers next iteration', async () => {
  const agent = createAgent([
    new DeviceNodeResponse({
      success: false,
      message: 'UiAutomation not connected',
    }),
    new DeviceNodeResponse({
      success: true,
      data: {
        screenshot: 'image',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
      },
    }),
  ]);

  let plannerCalls = 0;
  const aiAgent = createAiAgent(async () => {
    plannerCalls += 1;
    return {
      act: PLANNER_ACTION_COMPLETED,
      reason: 'Hindi added successfully',
      remember: [],
    };
  });

  const executor = new HeadlessGoalExecutor({
    goal: 'Add Hindi',
    platform: 'android',
    maxIterations: 3,
    agent,
    aiAgent,
  });

  const result = await executor.executeGoal();

  assert.equal(result.success, true);
  assert.equal(result.totalIterations, 2);
  assert.equal(plannerCalls, 1);
  assert.equal(result.steps[0]?.action, 'captureDeviceState');
  assert.equal(result.steps[0]?.success, false);
  assert.equal(result.steps[0]?.trace?.status, 'failure');
  assert.equal(result.steps[0]?.trace?.failureReason, 'UiAutomation not connected');
  assert.ok(
    result.steps[0]?.trace?.spans.some((span) => span.name === 'capture.total'),
  );
});

test('HeadlessGoalExecutor aborts immediately on fatal capture/setup failure', async () => {
  const agent = createAgent([
    new DeviceNodeResponse({
      success: false,
      message: 'gRPC client not connected',
    }),
  ]);

  const aiAgent = createAiAgent(async () => {
    throw new Error('Planner should not be called on fatal capture failure');
  });

  const executor = new HeadlessGoalExecutor({
    goal: 'Add Hindi',
    platform: 'android',
    maxIterations: 3,
    agent,
    aiAgent,
  });

  const result = await executor.executeGoal();

  assert.equal(result.success, false);
  assert.equal(result.message, 'gRPC client not connected');
  assert.equal(result.totalIterations, 1);
  assert.equal(result.steps[0]?.action, 'captureDeviceState');
});

test('HeadlessGoalExecutor emits debug step trace logs and summary timings', async (t) => {
  const executedActions: unknown[] = [];
  const agent = createGoalAgent({
    captureResponses: [
      new DeviceNodeResponse({
        success: true,
        data: {
          screenshot: 'image-step-1',
          hierarchy: '[]',
          screenWidth: 1080,
          screenHeight: 2400,
          captureTrace: {
            totalMs: 40,
            stabilityMs: 14,
            finalPayloadMs: 26,
            stable: true,
            pollCount: 2,
            attempts: 1,
          },
        },
      }),
      new DeviceNodeResponse({
        success: true,
        data: {
          screenshot: 'image-step-2',
          hierarchy: '[]',
          screenWidth: 1080,
          screenHeight: 2400,
          captureTrace: {
            totalMs: 32,
            stabilityMs: 10,
            finalPayloadMs: 22,
            stable: true,
            pollCount: 2,
            attempts: 1,
          },
        },
      }),
    ],
    executedActions,
  });

  let planCalls = 0;
  const aiAgent = {
    async plan() {
      planCalls += 1;
      if (planCalls === 1) {
        return {
          act: PLANNER_ACTION_TAP,
          reason: 'Tap the Add language button.',
          remember: [],
          trace: {
            totalMs: 55,
            promptBuildMs: 9,
            llmMs: 39,
            parseMs: 7,
          },
        };
      }

      return {
        act: PLANNER_ACTION_COMPLETED,
        reason: 'Hindi added successfully',
        remember: [],
        trace: {
          totalMs: 31,
          promptBuildMs: 5,
          llmMs: 21,
          parseMs: 5,
        },
      };
    },
    async ground() {
      return {
        output: { x: 120, y: 260 },
        raw: '{}',
        trace: {
          totalMs: 24,
          promptBuildMs: 4,
          llmMs: 15,
          parseMs: 5,
        },
      };
    },
  } as unknown as AIAgent;

  const logs: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  Logger.init({ level: LogLevel.DEBUG, tag: 'finalrun' });

  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  };

  t.after(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    Logger.init({ level: LogLevel.INFO, tag: 'finalrun' });
  });

  const executor = new HeadlessGoalExecutor({
    goal: 'Add Hindi',
    platform: 'android',
    maxIterations: 3,
    agent,
    aiAgent,
  });

  const result = await executor.executeGoal();

  assert.equal(result.success, true);
  assert.equal(result.totalIterations, 2);
  assert.equal(executedActions.length, 1);
  assert.equal(result.steps[0]?.action, PLANNER_ACTION_TAP);
  const spanNames = new Set(result.steps[0]?.trace?.spans.map((span) => span.name) ?? []);
  assert.equal(spanNames.size, 10);
  for (const expectedName of [
    'step.total',
    'capture.total',
    'capture.stability',
    'capture.final_payload',
    'planning.total',
    'planning.llm',
    'planning.parse',
    'action.total',
    'action.ground',
    'action.device',
  ]) {
    assert.ok(spanNames.has(expectedName), `missing span ${expectedName}`);
  }

  assert.ok(logs.some((line) => line.includes('[trace step=1 phase=capture.total] start')));
  assert.ok(logs.some((line) => line.includes('[trace step=1 phase=action.device] done')));

  const summaryLine = logs.find((line) => line.includes('[trace step=1] summary'));
  assert.ok(summaryLine);
  assert.match(summaryLine!, /capture=\d+ms\(stability=\d+ms,final_payload=\d+ms\)/);
  assert.match(summaryLine!, /planning=\d+ms\(llm=\d+ms,parse=\d+ms\)/);
  assert.match(summaryLine!, /action=\d+ms\(ground=\d+ms,device=\d+ms\)/);
  assert.match(summaryLine!, /result=success action=tap/);
});

test('HeadlessGoalExecutor records completed-step metadata for reporting', async () => {
  const agent = createAgent([
    new DeviceNodeResponse({
      success: true,
      data: {
        screenshot: 'image-step-1',
        hierarchy: '[]',
        screenWidth: 1080,
        screenHeight: 2400,
        captureTrace: {
          totalMs: 36,
          stabilityMs: 12,
          finalPayloadMs: 24,
          stable: true,
          pollCount: 2,
          attempts: 1,
        },
      },
    }),
  ]);

  const aiAgent = createAiAgent(async () => ({
    act: PLANNER_ACTION_COMPLETED,
    reason: 'Login flow completed successfully',
    analysis: 'The user reached the feed after login.',
    remember: [],
    text: '${secrets.email}',
    thought: {
      plan: 'Check whether login is already complete.',
      think: 'The feed is visible and no further action is needed.',
      act: 'Mark the spec as complete.',
    },
    trace: {
      totalMs: 28,
      promptBuildMs: 4,
      llmMs: 18,
      parseMs: 6,
    },
  }));

  const executor = new HeadlessGoalExecutor({
    goal: 'Log in and verify the feed',
    platform: 'android',
    maxIterations: 2,
    agent,
    aiAgent,
  });

  const result = await executor.executeGoal();

  assert.equal(result.success, true);
  assert.equal(result.platform, 'android');
  assert.ok(result.startedAt);
  assert.ok(result.completedAt);
  assert.equal(result.analysis, 'The user reached the feed after login.');
  assert.equal(result.steps.length, 1);
  assert.equal(result.steps[0]?.screenshot, 'image-step-1');
  assert.equal(result.steps[0]?.analysis, 'The user reached the feed after login.');
  assert.deepEqual(result.steps[0]?.thought, {
    plan: 'Check whether login is already complete.',
    think: 'The feed is visible and no further action is needed.',
    act: 'Mark the spec as complete.',
  });
  assert.deepEqual(result.steps[0]?.actionPayload, {
    text: '${secrets.email}',
    url: undefined,
    direction: undefined,
    clearText: undefined,
    durationSeconds: undefined,
    repeat: undefined,
    delayBetweenTapMs: undefined,
  });
  assert.ok(result.steps[0]?.timestamp);
  assert.ok(result.steps[0]?.durationMs !== undefined);
  assert.ok(result.steps[0]?.trace);
});
