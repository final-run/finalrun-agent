import assert from 'node:assert/strict';
import test from 'node:test';
import { PLANNER_ACTION_ROTATE } from '@finalrun/common';
import { AIAgent, GrounderResponse, PlannerResponse } from './AIAgent.js';

type LLMPhase = 'planner' | 'grounder';

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

function parseGrounderResponse(raw: string): GrounderResponse {
  const agent = new AIAgent({
    provider: 'google',
    modelName: 'gemini-test',
    apiKey: 'test-key',
  });

  return (
    agent as unknown as {
      _parseGrounderResponse: (value: string) => GrounderResponse;
    }
  )._parseGrounderResponse(raw);
}

function extractJson(raw: string): Record<string, unknown> | null {
  const agent = new AIAgent({
    provider: 'google',
    modelName: 'gemini-test',
    apiKey: 'test-key',
  });

  return (
    agent as unknown as {
      _extractJson: (value: string) => Record<string, unknown> | null;
    }
  )._extractJson(raw);
}

function getProviderOptions(params: {
  provider: string;
  modelName: string;
  phase: LLMPhase;
}): Record<string, unknown> | undefined {
  const agent = new AIAgent({
    provider: params.provider,
    modelName: params.modelName,
    apiKey: 'test-key',
  });

  return (
    agent as unknown as {
      _getProviderOptions: (phase: LLMPhase) => Record<string, unknown> | undefined;
    }
  )._getProviderOptions(params.phase);
}

test('AIAgent extracts plain valid JSON when top-level output is present', () => {
  const json = extractJson(JSON.stringify({
    output: { index: 42, reason: 'Exact text match.' },
  }));

  assert.deepEqual(json, {
    output: { index: 42, reason: 'Exact text match.' },
  });
});

test('AIAgent extracts JSON with top-level output from prose-wrapped responses', () => {
  const raw = `Here is the result:\n${JSON.stringify({ output: { index: 8, reason: 'Matched button.' } })}\nDone.`;
  const json = extractJson(raw);

  assert.deepEqual(json, {
    output: { index: 8, reason: 'Matched button.' },
  });
});

test('AIAgent extracts JSON with top-level output from fenced json blocks', () => {
  const payload = JSON.stringify({
    output: { packageName: 'com.example.app', reason: 'Matched by exact app name.' },
  });
  const raw = ['```json', payload, '```'].join('\n');
  const json = extractJson(raw);

  assert.deepEqual(json, {
    output: { packageName: 'com.example.app', reason: 'Matched by exact app name.' },
  });
});

test('AIAgent extractor returns null when top-level output is missing', () => {
  const json = extractJson(JSON.stringify({ index: 42, reason: 'Exact text match.' }));

  assert.equal(json, null);
});

test('AIAgent extracts JSON with escaped quotes, backslashes, and braces inside strings', () => {
  const payload = JSON.stringify({
    output: {
      reason: 'Brace {inside} and quote "ok" and slash \\',
      text: 'hello',
    },
  });
  const json = extractJson(`prefix\n\`\`\`json\n${payload}\n\`\`\`\nsuffix`);

  assert.deepEqual(json, {
    output: {
      reason: 'Brace {inside} and quote "ok" and slash \\',
      text: 'hello',
    },
  });
});

test('AIAgent extracts the JSON object containing output when multiple JSON objects exist', () => {
  const raw = `${JSON.stringify({ meta: { ok: true } })}\n${JSON.stringify({
    output: { start_x: 540, start_y: 1800, end_x: 540, end_y: 400, reason: 'Swipe up.' },
  })}`;
  const json = extractJson(raw);

  assert.deepEqual(json, {
    output: { start_x: 540, start_y: 1800, end_x: 540, end_y: 400, reason: 'Swipe up.' },
  });
});

test('AIAgent uses medium Gemini 3 reasoning defaults for planner calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'google',
    modelName: 'gemini-3.1-pro-preview',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    google: {
      thinkingConfig: {
        thinkingLevel: 'medium',
        includeThoughts: false,
      },
    },
  });
});

test('AIAgent uses minimal Gemini 3 reasoning defaults for grounder calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'google',
    modelName: 'gemini-3.1-pro-preview',
    phase: 'grounder',
  });

  assert.deepEqual(providerOptions, {
    google: {
      thinkingConfig: {
        thinkingLevel: 'minimal',
        includeThoughts: false,
      },
    },
  });
});

test('AIAgent applies Google reasoning defaults without model-family gating', () => {
  const providerOptions = getProviderOptions({
    provider: 'google',
    modelName: 'gemini-2.0-flash',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    google: {
      thinkingConfig: {
        thinkingLevel: 'medium',
        includeThoughts: false,
      },
    },
  });
});

test('AIAgent uses medium GPT-5 reasoning defaults for planner calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'openai',
    modelName: 'gpt-5',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    openai: {
      reasoningEffort: 'medium',
    },
  });
});

test('AIAgent uses low GPT-5 reasoning defaults for grounder calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'openai',
    modelName: 'gpt-5',
    phase: 'grounder',
  });

  assert.deepEqual(providerOptions, {
    openai: {
      reasoningEffort: 'low',
    },
  });
});

test('AIAgent applies OpenAI reasoning defaults without model-family gating', () => {
  const providerOptions = getProviderOptions({
    provider: 'openai',
    modelName: 'gpt-5.4-mini',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    openai: {
      reasoningEffort: 'medium',
    },
  });
});

test('AIAgent uses medium Anthropic effort defaults for planner calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-6',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    anthropic: {
      effort: 'medium',
    },
  });
});

test('AIAgent uses low Anthropic effort defaults for grounder calls', () => {
  const providerOptions = getProviderOptions({
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-6',
    phase: 'grounder',
  });

  assert.deepEqual(providerOptions, {
    anthropic: {
      effort: 'low',
    },
  });
});

test('AIAgent applies Anthropic effort defaults without model-family gating', () => {
  const providerOptions = getProviderOptions({
    provider: 'anthropic',
    modelName: 'claude-3-7-sonnet-latest',
    phase: 'planner',
  });

  assert.deepEqual(providerOptions, {
    anthropic: {
      effort: 'medium',
    },
  });
});

test('AIAgent normalizes rotate planner actions', () => {
  const response = parsePlannerResponse(
    JSON.stringify({
      output: {
        action: {
          action_type: 'rotate',
        },
        remember: [],
      },
    }),
  );

  assert.equal(response.act, PLANNER_ACTION_ROTATE);
  assert.equal(response.reason, 'Rotate the device orientation.');
});

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

test('AIAgent parses standard grounder output', () => {
  const response = parseGrounderResponse(JSON.stringify({
    output: { index: 42, reason: 'Exact text match.' },
  }));

  assert.deepEqual(response.output, {
    index: 42,
    reason: 'Exact text match.',
  });
});

test('AIAgent parses scroll grounder output with snake_case coordinates', () => {
  const response = parseGrounderResponse(JSON.stringify({
    output: {
      start_x: 540,
      start_y: 1800,
      end_x: 540,
      end_y: 400,
      durationMs: 600,
      reason: 'Computed swipe up vector.',
    },
  }));

  assert.deepEqual(response.output, {
    start_x: 540,
    start_y: 1800,
    end_x: 540,
    end_y: 400,
    durationMs: 600,
    reason: 'Computed swipe up vector.',
  });
});

test('AIAgent parses launch-app grounder output', () => {
  const response = parseGrounderResponse(JSON.stringify({
    output: {
      packageName: 'com.whatsapp',
      allowAllPermissions: false,
      reason: 'Matched by exact app name.',
    },
  }));

  assert.deepEqual(response.output, {
    packageName: 'com.whatsapp',
    allowAllPermissions: false,
    reason: 'Matched by exact app name.',
  });
});

test('AIAgent parses set-location grounder output', () => {
  const response = parseGrounderResponse(JSON.stringify({
    output: {
      lat: '37.7749',
      long: '-122.4194',
      reason: 'Resolved San Francisco to city center coordinates.',
    },
  }));

  assert.deepEqual(response.output, {
    lat: '37.7749',
    long: '-122.4194',
    reason: 'Resolved San Francisco to city center coordinates.',
  });
});

test('AIAgent rejects planner responses without top-level output', () => {
  assert.throws(
    () => parsePlannerResponse(JSON.stringify({
      action_type: 'tap',
      reason: 'Tap the target element.',
    })),
    /top-level output/,
  );
});

test('AIAgent rejects grounder responses without top-level output', () => {
  assert.throws(
    () => parseGrounderResponse(JSON.stringify({
      index: 42,
      reason: 'Exact text match.',
    })),
    /top-level output/,
  );
});
