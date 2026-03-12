import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DeviceActionRequest,
  DeviceNodeResponse,
  TapAction,
  EnterTextAction,
  DeeplinkAction,
  FEATURE_GROUNDER,
  FEATURE_INPUT_FOCUS_GROUNDER,
  PLANNER_ACTION_TAP,
  PLANNER_ACTION_TYPE,
  PLANNER_ACTION_DEEPLINK,
} from '@finalrun/common';
import type { Agent } from '@finalrun/common';
import type { AIAgent, GrounderResponse } from './ai/AIAgent.js';
import { HeadlessActionExecutor } from './HeadlessActionExecutor.js';

function createAgent(executedActions: unknown[]): Agent {
  return {
    async setUp() {
      return new DeviceNodeResponse({ success: true });
    },
    async executeAction(request: DeviceActionRequest) {
      executedActions.push(request.action);
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

function createAiAgent(
  groundImpl: (feature: string) => Promise<GrounderResponse>,
): AIAgent {
  return {
    async ground(request: { feature: string }) {
      return groundImpl(request.feature);
    },
  } as unknown as AIAgent;
}

test('HeadlessActionExecutor repeats tap actions using the planner repeat fields', async () => {
  const executedActions: unknown[] = [];
  const agent = createAgent(executedActions);
  const aiAgent = createAiAgent(async (feature) => {
    assert.equal(feature, FEATURE_GROUNDER);
    return {
      output: { x: 100, y: 200 },
      raw: '{}',
    };
  });

  const executor = new HeadlessActionExecutor({
    agent,
    aiAgent,
    platform: 'android',
  });

  const result = await executor.executeAction({
    action: PLANNER_ACTION_TAP,
    reason: 'Tap the Add language button.',
    repeat: 3,
    delayBetweenTapMs: 0,
    screenWidth: 1080,
    screenHeight: 2400,
  });

  assert.equal(result.success, true);
  assert.equal(executedActions.length, 3);
  assert.ok(executedActions.every((action) => action instanceof TapAction));
});

test('HeadlessActionExecutor uses structured input text fields instead of extracting from reason', async () => {
  const executedActions: unknown[] = [];
  const agent = createAgent(executedActions);
  const aiAgent = createAiAgent(async (feature) => {
    assert.equal(feature, FEATURE_INPUT_FOCUS_GROUNDER);
    return {
      output: { index: null },
      raw: '{}',
    };
  });

  const executor = new HeadlessActionExecutor({
    agent,
    aiAgent,
    platform: 'android',
  });

  const result = await executor.executeAction({
    action: PLANNER_ACTION_TYPE,
    reason: 'Type into the language search field.',
    text: 'Hindi',
    clearText: false,
    screenWidth: 1080,
    screenHeight: 2400,
  });

  assert.equal(result.success, true);
  assert.equal(executedActions.length, 1);
  assert.ok(executedActions[0] instanceof EnterTextAction);
  assert.equal((executedActions[0] as EnterTextAction).value, 'Hindi');
  assert.equal((executedActions[0] as EnterTextAction).shouldEraseText, false);
});

test('HeadlessActionExecutor uses structured deeplink URLs from the planner action payload', async () => {
  const executedActions: unknown[] = [];
  const agent = createAgent(executedActions);
  const aiAgent = createAiAgent(async () => {
    throw new Error('Grounder should not be called for deeplink actions');
  });

  const executor = new HeadlessActionExecutor({
    agent,
    aiAgent,
    platform: 'android',
  });

  const result = await executor.executeAction({
    action: PLANNER_ACTION_DEEPLINK,
    reason: 'Open the settings page.',
    url: 'wikipedia://settings/languages',
    screenWidth: 1080,
    screenHeight: 2400,
  });

  assert.equal(result.success, true);
  assert.equal(executedActions.length, 1);
  assert.ok(executedActions[0] instanceof DeeplinkAction);
  assert.equal(
    (executedActions[0] as DeeplinkAction).deeplink,
    'wikipedia://settings/languages',
  );
});
