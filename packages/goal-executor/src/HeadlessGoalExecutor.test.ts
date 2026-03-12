import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeviceActionRequest,
  DeviceNodeResponse,
  GetScreenshotAndHierarchyAction,
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
