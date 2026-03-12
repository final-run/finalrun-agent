import assert from 'node:assert/strict';
import test from 'node:test';
import { AIAgent, PlannerResponse } from './AIAgent.js';

function parsePlannerResponse(raw: string): PlannerResponse {
  const agent = new AIAgent({
    provider: 'google',
    modelName: 'gemini-test',
    apiKey: 'test-key',
  });

  return (
    agent as unknown as {
      _parsePlannerResponse: (value: string) => PlannerResponse;
    }
  )._parsePlannerResponse(raw);
}

test('AIAgent normalizes nested planner output from planner prompt schema', () => {
  const response = parsePlannerResponse(JSON.stringify({
    output: {
      thought: {
        plan: '[-> Type Hindi]',
        think: 'The language picker is focused and ready.',
        act: 'Type "Hindi" into the search field.',
      },
      action: {
        action_type: 'input_text',
        text: 'Hindi',
        clear_text: true,
      },
      remember: ['At step 2, Hindi search has started.'],
    },
  }));

  assert.equal(response.act, 'type');
  assert.equal(response.reason, 'Type "Hindi" into the search field.');
  assert.equal(response.text, 'Hindi');
  assert.equal(response.clearText, true);
  assert.deepEqual(response.remember, ['At step 2, Hindi search has started.']);
  assert.equal(response.thought?.plan, '[-> Type Hindi]');
});

test('AIAgent maps terminal status responses to completed and keeps analysis as the message', () => {
  const response = parsePlannerResponse(JSON.stringify({
    output: {
      thought: {
        plan: '[✓ Verify language added]',
        think: 'Hindi is visible in the added languages list.',
        act: 'This should not override the final analysis.',
      },
      action: {
        action_type: 'status',
        result: 'Success',
        analysis: 'Hindi is visible in the selected languages list.',
      },
      remember: [],
    },
  }));

  assert.equal(response.act, 'completed');
  assert.equal(response.reason, 'Hindi is visible in the selected languages list.');
  assert.equal(response.result, 'Success');
  assert.equal(response.analysis, 'Hindi is visible in the selected languages list.');
  assert.deepEqual(response.remember, []);
});
