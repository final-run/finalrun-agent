import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiKey } from './apiKey.js';

function createEnv(values: Record<string, string>) {
  return {
    get(key: string): string | undefined {
      return values[key];
    },
  };
}

test('resolveApiKey prefers the env var that matches the selected provider', () => {
  const apiKey = resolveApiKey({
    env: createEnv({
      OPENAI_API_KEY: 'openai-key',
      GOOGLE_API_KEY: 'google-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
    }),
    provider: 'google',
  });

  assert.equal(apiKey, 'google-key');
});

test('resolveApiKey falls back to API_KEY when the provider-specific env var is absent', () => {
  const apiKey = resolveApiKey({
    env: createEnv({
      API_KEY: 'shared-key',
    }),
    provider: 'anthropic',
  });

  assert.equal(apiKey, 'shared-key');
});

test('resolveApiKey lets --api-key override environment variables', () => {
  const apiKey = resolveApiKey({
    env: createEnv({
      GOOGLE_API_KEY: 'google-key',
    }),
    provider: 'google',
    providedApiKey: 'flag-key',
  });

  assert.equal(apiKey, 'flag-key');
});

test('resolveApiKey reports the provider-matched env var in its error message', () => {
  assert.throws(
    () =>
      resolveApiKey({
        env: createEnv({}),
        provider: 'google',
      }),
    /Provide via --api-key, GOOGLE_API_KEY, or API_KEY/,
  );
});
