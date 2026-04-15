import assert from 'node:assert/strict';
import test from 'node:test';
import { Hierarchy, PLANNER_ACTION_TAP } from '@finalrun/common';
import { AIAgent } from './AIAgent.js';

// T026: Snapshot-style tests for AIAgent.planMulti.
//
// Mocks `_callLLM` on a fresh AIAgent instance to feed deterministic outputs,
// asserting that:
//   (a) a well-formed 2-device response round-trips into MultiDevicePlannerResponse,
//   (b) duplicate-device responses retry once, then terminal-error,
//   (c) unknown-device responses retry once, then terminal-error naming the
//       unknown key.

type LLMPhase = 'planner' | 'grounder';
type MockLLMResult = { output: unknown; text: string };

function makeAgent(): AIAgent {
  return new AIAgent({
    provider: 'google',
    modelName: 'gemini-test',
    apiKey: 'test-key',
  });
}

function installMockCallLLM(
  agent: AIAgent,
  results: Array<MockLLMResult | Error>,
): { callCount: () => number } {
  let idx = 0;
  (
    agent as unknown as {
      _callLLM: (
        systemPrompt: string,
        userParts: unknown[],
        phase: LLMPhase,
      ) => Promise<MockLLMResult>;
    }
  )._callLLM = async () => {
    const next = results[idx++];
    if (next instanceof Error) {
      throw next;
    }
    if (!next) {
      throw new Error(`No more mock results (called ${idx} times)`);
    }
    return next;
  };
  return { callCount: () => idx };
}

function emptyHierarchy(): Hierarchy {
  return new Hierarchy(null);
}

function fixtureMultiDeviceRequest() {
  return {
    testObjective: 'alice sends a message, bob receives it',
    devices: ['alice', 'bob'],
    activeDeviceStates: {
      alice: {
        postActionScreenshot: 'data:image/png;base64,AAA=',
        hierarchy: emptyHierarchy(),
        platform: 'android',
      },
      bob: {
        postActionScreenshot: 'data:image/png;base64,BBB=',
        hierarchy: emptyHierarchy(),
        platform: 'android',
      },
    },
  };
}

const validMultiOutput = {
  output: {
    thought: { plan: '[→ 1]', think: 'alice first.', act: 'tap compose' },
    actions: [
      {
        device: 'alice',
        action: { action_type: 'tap', reason: 'open composer' },
      },
    ],
    remember: [],
  },
};

test('planMulti round-trips a well-formed single-device response', async () => {
  const agent = makeAgent();
  const mock = installMockCallLLM(agent, [{ output: validMultiOutput, text: '' }]);
  const response = await agent.planMulti(fixtureMultiDeviceRequest());
  assert.equal(response.actions.length, 1);
  assert.equal(response.actions[0]!.device, 'alice');
  assert.equal(response.actions[0]!.action.act, PLANNER_ACTION_TAP);
  assert.equal(mock.callCount(), 1);
});

test('planMulti retries once on duplicate-device response, then throws', async () => {
  const duplicateOutput = {
    output: {
      actions: [
        { device: 'alice', action: { action_type: 'tap' } },
        { device: 'alice', action: { action_type: 'tap' } },
      ],
      remember: [],
    },
  };
  const agent = makeAgent();
  const mock = installMockCallLLM(agent, [
    { output: duplicateOutput, text: '' },
    { output: duplicateOutput, text: '' },
  ]);
  await assert.rejects(
    () => agent.planMulti(fixtureMultiDeviceRequest()),
    /duplicate device/,
  );
  assert.equal(mock.callCount(), 2);
});

test('planMulti retries once on unknown-device response, then throws naming the key', async () => {
  const unknownOutput = {
    output: {
      actions: [{ device: 'carol', action: { action_type: 'tap' } }],
      remember: [],
    },
  };
  const agent = makeAgent();
  const mock = installMockCallLLM(agent, [
    { output: unknownOutput, text: '' },
    { output: unknownOutput, text: '' },
  ]);
  await assert.rejects(
    () => agent.planMulti(fixtureMultiDeviceRequest()),
    /unknown device 'carol'/,
  );
  assert.equal(mock.callCount(), 2);
});

test('planMulti retries once on a >2-actions response, then throws', async () => {
  const tooMany = {
    output: {
      actions: [
        { device: 'alice', action: { action_type: 'tap' } },
        { device: 'bob', action: { action_type: 'tap' } },
        { device: 'alice', action: { action_type: 'tap' } },
      ],
      remember: [],
    },
  };
  const agent = makeAgent();
  const mock = installMockCallLLM(agent, [
    { output: tooMany, text: '' },
    { output: tooMany, text: '' },
  ]);
  await assert.rejects(
    () => agent.planMulti(fixtureMultiDeviceRequest()),
    /max is 2/,
  );
  assert.equal(mock.callCount(), 2);
});
