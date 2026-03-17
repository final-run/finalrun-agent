import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function createTempWorkspace(params?: {
  envFiles?: Record<string, string>;
  includeEnvDir?: boolean;
  specLines?: string[];
}): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-bin-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  if (params?.includeEnvDir !== false) {
    fs.mkdirSync(envDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(testsDir, 'login.yaml'),
    (params?.specLines ?? ['name: login', 'steps:', '  - Open the login screen.']).join('\n'),
    'utf-8',
  );

  if (params?.includeEnvDir !== false) {
    for (const [fileName, contents] of Object.entries(
      params?.envFiles ?? { 'dev.yaml': '{}\n' },
    )) {
      fs.writeFileSync(path.join(envDir, fileName), contents, 'utf-8');
    }
  }

  return rootDir;
}

function runCli(args: string[], cwd: string) {
  const binPath = path.resolve(__dirname, '../bin/finalrun.js');
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf-8',
  });
}

test('finalrun check works without --env when dev.yaml exists', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'dev.yaml': ['variables:', '  locale: en-US'].join('\n'),
    },
  });

  try {
    const result = runCli(['check'], rootDir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /using env dev\./);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun check reports an env ambiguity error instead of a parser error when --env is omitted', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'staging.yaml': '{}\n',
      'prod.yaml': '{}\n',
    },
  });

  try {
    const result = runCli(['check'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass --env <name>\. Available environments: prod, staging/);
    assert.doesNotMatch(result.stderr, /required option '--env <name>' not specified/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun check works without --env when .finalrun/env is absent and the spec is env-free', async () => {
  const rootDir = createTempWorkspace({
    includeEnvDir: false,
  });

  try {
    const result = runCli(['check'], rootDir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /using no env bindings\./);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun check fails with actionable binding guidance when .finalrun/env is absent and the spec references env bindings', async () => {
  const rootDir = createTempWorkspace({
    includeEnvDir: false,
    specLines: [
      'name: login',
      'steps:',
      '  - Enter ${secrets.email} on the login screen.',
    ],
  });

  try {
    const result = runCli(['check'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no environment configuration was resolved/);
    assert.match(result.stderr, /\$\{secrets\.email\}/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});
