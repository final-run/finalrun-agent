import assert from 'node:assert/strict';
import test from 'node:test';
import type { MultiDeviceConfig, TestDefinition } from '@finalrun/common';
import { compileMultiDeviceTestObjective } from './multiDeviceTestCompiler.js';

// T025: Compiler behavior for the multi-device goal string — interpolates
// `${variables.*}` tokens eagerly; `${devices.*}` and `${secrets.*}` are
// preserved literally so the planner receives them verbatim.

const FIXTURE_CONFIG: MultiDeviceConfig = {
  devices: {
    alice: { platform: 'android', app: 'com.example.chat' },
    bob: { platform: 'android', app: 'com.example.chat' },
  },
};

const FIXTURE_TEST: TestDefinition = {
  name: 'send_message_${variables.ENV}',
  description: 'chat test on ${variables.ENV}',
  setup: ['Launch ${devices.alice}', 'Launch ${devices.bob}'],
  steps: [
    '${devices.alice} taps compose and types "${secrets.API_TOKEN}"',
    '${devices.bob} opens inbox',
  ],
  expected_state: ['Both devices show ${variables.EXPECTED_CONTENT}'],
  sourcePath: '/fixtures/chat/send_message.yaml',
  relativePath: 'chat/send_message.yaml',
  testId: 'chat__send_message',
};

test('compiler interpolates ${variables.*} eagerly', () => {
  const compiled = compileMultiDeviceTestObjective(FIXTURE_TEST, FIXTURE_CONFIG, {
    variables: { ENV: 'staging', EXPECTED_CONTENT: 'the message' },
    secrets: {},
  });
  assert.match(compiled, /send_message_staging/);
  assert.match(compiled, /chat test on staging/);
  assert.match(compiled, /Both devices show the message/);
});

test('compiler preserves ${secrets.*} and ${devices.*} literally', () => {
  const compiled = compileMultiDeviceTestObjective(FIXTURE_TEST, FIXTURE_CONFIG, {
    variables: { ENV: 'staging', EXPECTED_CONTENT: 'the message' },
    secrets: { API_TOKEN: 'super-secret' },
  });
  // Secrets MUST NOT be substituted at compile time.
  assert.ok(!compiled.includes('super-secret'));
  assert.ok(compiled.includes('${secrets.API_TOKEN}'));
  // Device tokens MUST pass through to the planner.
  assert.ok(compiled.includes('${devices.alice}'));
  assert.ok(compiled.includes('${devices.bob}'));
});

test('compiler emits a Devices: header with key=platform+app triples', () => {
  const compiled = compileMultiDeviceTestObjective(FIXTURE_TEST, FIXTURE_CONFIG, {
    variables: {},
    secrets: {},
  });
  assert.ok(compiled.includes('Devices:'));
  assert.ok(compiled.includes('- alice: platform=android, app=com.example.chat'));
  assert.ok(compiled.includes('- bob: platform=android, app=com.example.chat'));
});

test('compiler leaves unknown ${variables.*} tokens in place (no silent drop)', () => {
  const compiled = compileMultiDeviceTestObjective(FIXTURE_TEST, FIXTURE_CONFIG, {
    variables: {},
    secrets: {},
  });
  // Unknown variable tokens should round-trip unchanged so authors can spot
  // typos rather than get silently blank strings.
  assert.ok(compiled.includes('${variables.ENV}'));
  assert.ok(compiled.includes('${variables.EXPECTED_CONTENT}'));
});
