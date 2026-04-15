import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  collectAllMultiDeviceTests,
  loadMultiDeviceConfig,
  loadMultiDeviceTest,
} from './multiDeviceTestLoader.js';

// T024/T025: Fixture-driven tests for the multi-device loader + compiler.
// Fixtures are materialized in tmpdirs so they stay test-only and never
// collide with a real `.finalrun/multi-device/` workspace.

function writeFixtureTree(
  root: string,
  files: Record<string, string>,
): string {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-md-'));
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(base, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents, 'utf-8');
  }
  return base;
}

const VALID_DEVICES_YAML = `devices:
  alice:
    platform: android
    app: com.example.chat
  bob:
    platform: android
    app: com.example.chat
`;

const VALID_TEST_YAML = `name: send_message
description: Alice sends, Bob replies
setup:
  - Launch \${devices.alice}
  - Launch \${devices.bob}
steps:
  - \${devices.alice} taps compose
  - \${devices.alice} types hi and sends
  - \${devices.bob} opens conversation
  - \${devices.alice} \${devices.bob} observe message delivery
expected_state:
  - Both devices show the message
`;

test('loadMultiDeviceConfig accepts exactly 2 android devices', async () => {
  const base = writeFixtureTree('valid', {
    'devices.yaml': VALID_DEVICES_YAML,
  });
  const loaded = await loadMultiDeviceConfig(base);
  assert.deepEqual(Object.keys(loaded.config.devices), ['alice', 'bob']);
  assert.equal(loaded.config.devices['alice']!.platform, 'android');
  assert.equal(loaded.config.devices['bob']!.app, 'com.example.chat');
});

test('loadMultiDeviceConfig rejects 1 device', async () => {
  const base = writeFixtureTree('one', {
    'devices.yaml': `devices:\n  alice:\n    platform: android\n    app: com.example.chat\n`,
  });
  await assert.rejects(() => loadMultiDeviceConfig(base), /exactly 2 devices/);
});

test('loadMultiDeviceConfig rejects 3 devices', async () => {
  const base = writeFixtureTree('three', {
    'devices.yaml': `devices:\n  alice:\n    platform: android\n    app: com.example.chat\n  bob:\n    platform: android\n    app: com.example.chat\n  carol:\n    platform: android\n    app: com.example.chat\n`,
  });
  await assert.rejects(() => loadMultiDeviceConfig(base), /exactly 2 devices/);
});

test('loadMultiDeviceConfig rejects cross-platform devices', async () => {
  const base = writeFixtureTree('cross', {
    'devices.yaml': `devices:\n  alice:\n    platform: android\n    app: com.example.chat\n  bob:\n    platform: ios\n    app: com.example.chat\n`,
  });
  await assert.rejects(() => loadMultiDeviceConfig(base), /single platform/);
});

test('loadMultiDeviceConfig rejects non-android v1 (iOS-only manifest)', async () => {
  const base = writeFixtureTree('ios-only', {
    'devices.yaml': `devices:\n  alice:\n    platform: ios\n    app: com.example.chat\n  bob:\n    platform: ios\n    app: com.example.chat\n`,
  });
  await assert.rejects(
    () => loadMultiDeviceConfig(base),
    /v1 supports only platform "android"/,
  );
});

test('loadMultiDeviceTest requires at least one ${devices.X} token per step', async () => {
  const base = writeFixtureTree('token-missing', {
    'devices.yaml': VALID_DEVICES_YAML,
    'tests/bad.yaml': `name: bad\nsteps:\n  - open the app\n`,
  });
  const { config } = await loadMultiDeviceConfig(base);
  await assert.rejects(
    () =>
      loadMultiDeviceTest(
        path.join(base, 'tests/bad.yaml'),
        path.join(base, 'tests'),
        config,
      ),
    /must reference at least one device/,
  );
});

test('loadMultiDeviceTest rejects unknown device key in step token', async () => {
  const base = writeFixtureTree('unknown-key', {
    'devices.yaml': VALID_DEVICES_YAML,
    'tests/bad.yaml': `name: bad\nsteps:\n  - \${devices.carol} taps send\n`,
  });
  const { config } = await loadMultiDeviceConfig(base);
  await assert.rejects(
    () =>
      loadMultiDeviceTest(
        path.join(base, 'tests/bad.yaml'),
        path.join(base, 'tests'),
        config,
      ),
    /references unknown device "carol"/,
  );
});

test('loadMultiDeviceTest accepts a well-formed test', async () => {
  const base = writeFixtureTree('ok', {
    'devices.yaml': VALID_DEVICES_YAML,
    'tests/chat/send_message.yaml': VALID_TEST_YAML,
  });
  const { config } = await loadMultiDeviceConfig(base);
  const testDef = await loadMultiDeviceTest(
    path.join(base, 'tests/chat/send_message.yaml'),
    path.join(base, 'tests'),
    config,
  );
  assert.equal(testDef.name, 'send_message');
  assert.equal(testDef.steps.length, 4);
  assert.equal(testDef.relativePath, 'chat/send_message.yaml');
});

test('collectAllMultiDeviceTests walks tree and validates each test', async () => {
  const base = writeFixtureTree('tree', {
    'devices.yaml': VALID_DEVICES_YAML,
    'tests/a/alpha.yaml': `name: alpha\nsteps:\n  - \${devices.alice} taps x\n`,
    'tests/b/beta.yaml': `name: beta\nsteps:\n  - \${devices.bob} taps y\n`,
  });
  const { config } = await loadMultiDeviceConfig(base);
  const tests = await collectAllMultiDeviceTests(
    path.join(base, 'tests'),
    config,
  );
  const names = tests.map((t) => t.name).sort();
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('collectAllMultiDeviceTests returns [] when dir missing', async () => {
  const base = writeFixtureTree('empty', {
    'devices.yaml': VALID_DEVICES_YAML,
  });
  const { config } = await loadMultiDeviceConfig(base);
  const tests = await collectAllMultiDeviceTests(
    path.join(base, 'does-not-exist'),
    config,
  );
  assert.deepEqual(tests, []);
});
