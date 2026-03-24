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
  includeSuitesDir?: boolean;
  specLines?: string[];
  specs?: Record<string, string>;
  suites?: Record<string, string>;
}): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-bin-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  const suitesDir = path.join(rootDir, '.finalrun', 'suites');
  fs.mkdirSync(testsDir, { recursive: true });
  if (params?.includeEnvDir !== false) {
    fs.mkdirSync(envDir, { recursive: true });
  }
  const suites = params?.suites ?? {};
  if ((params?.includeSuitesDir ?? Object.keys(suites).length > 0) === true) {
    fs.mkdirSync(suitesDir, { recursive: true });
  }

  const specs = params?.specs ?? {
    'login.yaml': (params?.specLines ?? [
      'name: login',
      'steps:',
      '  - Open the login screen.',
    ]).join('\n'),
  };
  for (const [relativePath, contents] of Object.entries(specs)) {
    const targetPath = path.join(testsDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf-8');
  }

  for (const [relativePath, contents] of Object.entries(suites)) {
    const targetPath = path.join(suitesDir, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, contents, 'utf-8');
  }

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

test('finalrun check accepts repeated selectors and comma-delimited selectors', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'login.yaml': ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
      'auth/profile/edit.yaml': ['name: edit', 'steps:', '  - Edit the profile.'].join('\n'),
    },
  });

  try {
    const repeatedResult = runCli(['check', 'login.yaml', 'auth/profile/edit.yaml'], rootDir);
    assert.equal(repeatedResult.status, 0);
    assert.match(repeatedResult.stdout, /Validated 2 spec\(s\)/);
    assert.equal(repeatedResult.stderr, '');

    const commaResult = runCli(['check', 'login.yaml,auth/profile/edit.yaml'], rootDir);
    assert.equal(commaResult.status, 0);
    assert.match(commaResult.stdout, /Validated 2 spec\(s\)/);
    assert.equal(commaResult.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun check validates suite manifests with --suite', async () => {
  const rootDir = createTempWorkspace({
    specs: {
      'login.yaml': ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
      'dashboard/home.yaml': ['name: home', 'steps:', '  - Open dashboard.'].join('\n'),
    },
    suites: {
      'login_suite.yaml': [
        'name: login suite',
        'tests:',
        '  - login.yaml',
        '  - dashboard/**',
      ].join('\n'),
    },
  });

  try {
    const result = runCli(['check', '--suite', 'login_suite.yaml'], rootDir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Validated 2 spec\(s\)/);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun test reports missing selectors before API key validation', async () => {
  const rootDir = createTempWorkspace();

  try {
    const result = runCli(['test'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /At least one test selector is required/);
    assert.doesNotMatch(result.stderr, /API key is required/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun test rejects mixing --suite with selectors before API key validation', async () => {
  const rootDir = createTempWorkspace({
    suites: {
      'login_suite.yaml': ['name: login suite', 'tests:', '  - login.yaml'].join('\n'),
    },
  });

  try {
    const result = runCli(['test', '--suite', 'login_suite.yaml', 'login.yaml'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Pass either --suite <path> or positional test selectors, not both/);
    assert.doesNotMatch(result.stderr, /API key is required/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun runs --json prints the saved runs index', async () => {
  const rootDir = createTempWorkspace();
  const artifactsDir = path.join(rootDir, '.finalrun', 'artifacts');
  await fsp.mkdir(artifactsDir, { recursive: true });
  await fsp.writeFile(
    path.join(artifactsDir, 'runs.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: '2026-03-23T18:00:00.000Z',
        runs: [
          {
            runId: '2026-03-23T18-00-00.000Z-dev-android',
            success: false,
            status: 'failure',
            startedAt: '2026-03-23T18:00:00.000Z',
            completedAt: '2026-03-23T18:00:10.000Z',
            durationMs: 10000,
            envName: 'dev',
            platform: 'android',
            modelLabel: 'openai/gpt-4o',
            appLabel: 'repo app',
            specCount: 1,
            passedCount: 0,
            failedCount: 1,
            stepCount: 1,
            paths: {
              html: '2026-03-23T18-00-00.000Z-dev-android/index.html',
              runJson: '2026-03-23T18-00-00.000Z-dev-android/run.json',
              log: '2026-03-23T18-00-00.000Z-dev-android/runner.log',
            },
          },
        ],
      },
      null,
      2,
    ),
    'utf-8',
  );

  try {
    const result = runCli(['runs', '--json'], rootDir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"runId": "2026-03-23T18-00-00.000Z-dev-android"/);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun runs prints a console summary and root report path', async () => {
  const rootDir = createTempWorkspace();
  const artifactsDir = path.join(rootDir, '.finalrun', 'artifacts');
  await fsp.mkdir(artifactsDir, { recursive: true });
  await fsp.writeFile(
    path.join(artifactsDir, 'runs.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: '2026-03-23T18:00:00.000Z',
        runs: [
          {
            runId: '2026-03-23T18-00-00.000Z-dev-android',
            success: true,
            status: 'success',
            startedAt: '2026-03-23T18:00:00.000Z',
            completedAt: '2026-03-23T18:00:10.000Z',
            durationMs: 10000,
            envName: 'dev',
            platform: 'android',
            modelLabel: 'openai/gpt-4o',
            appLabel: 'repo app',
            specCount: 2,
            passedCount: 2,
            failedCount: 0,
            stepCount: 4,
            paths: {
              html: '2026-03-23T18-00-00.000Z-dev-android/index.html',
              runJson: '2026-03-23T18-00-00.000Z-dev-android/run.json',
              log: '2026-03-23T18-00-00.000Z-dev-android/runner.log',
            },
          },
        ],
      },
      null,
      2,
    ),
    'utf-8',
  );

  try {
    const result = runCli(['runs'], rootDir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /PASS/);
    assert.match(result.stdout, /Open .*\.finalrun\/artifacts\/index\.html/);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});
