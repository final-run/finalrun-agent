import assert from 'node:assert/strict';
import test from 'node:test';
import { parseModel } from './env.js';

test('parseModel requires an explicit model value', () => {
  assert.throws(
    () => parseModel(undefined),
    /--model is required\. Use provider\/model, for example google\/gemini-3-flash-preview\. Supported providers: openai, google, anthropic\./,
  );
});

test('parseModel trims outer whitespace before validation', () => {
  assert.deepEqual(parseModel('  google/gemini-3-flash-preview  '), {
    provider: 'google',
    modelName: 'gemini-3-flash-preview',
  });
});

test('parseModel rejects malformed values without a slash', () => {
  assert.throws(
    () => parseModel('openai'),
    /Invalid model format: "openai"\. Expected provider\/model with non-empty provider and model name\. Supported providers: openai, google, anthropic\./,
  );
});

test('parseModel rejects an empty provider segment', () => {
  assert.throws(
    () => parseModel('/gpt-4o'),
    /Invalid model format: "\/gpt-4o"\. Expected provider\/model with non-empty provider and model name\. Supported providers: openai, google, anthropic\./,
  );
});

test('parseModel rejects an empty model segment', () => {
  assert.throws(
    () => parseModel('openai/'),
    /Invalid model format: "openai\/"\. Expected provider\/model with non-empty provider and model name\. Supported providers: openai, google, anthropic\./,
  );
});

test('parseModel rejects unsupported providers', () => {
  assert.throws(
    () => parseModel('bedrock/claude'),
    /Unsupported AI provider: "bedrock"\. Supported providers: openai, google, anthropic\./,
  );
});
