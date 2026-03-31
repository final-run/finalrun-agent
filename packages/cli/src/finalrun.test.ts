import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { PLATFORM_ANDROID, PLATFORM_IOS } from '@finalrun/common';
import { runDoctorCommand } from './doctorRunner.js';

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
  const compiledBinPath = path.resolve(__dirname, '../bin/finalrun.js');
  const sourceBinPath = path.resolve(__dirname, '../bin/finalrun.ts');
  const tsxCliPath = path.resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs');
  const tsconfigPath = path.resolve(__dirname, '../../../tsconfig.dev.json');
  const commandArgs = fs.existsSync(compiledBinPath)
    ? [compiledBinPath, ...args]
    : fs.existsSync(tsconfigPath)
      ? [tsxCliPath, '--tsconfig', tsconfigPath, sourceBinPath, ...args]
      : [tsxCliPath, sourceBinPath, ...args];
  return spawnSync(process.execPath, commandArgs, {
    cwd,
    env: process.env,
    encoding: 'utf-8',
  });
}

function createDoctorDependencies(params: {
  requestedPlatforms?: Array<typeof PLATFORM_ANDROID | typeof PLATFORM_IOS>;
  reportChecks: Array<{
    platform: 'android' | 'ios' | 'common';
    status: 'ok' | 'error' | 'warning';
    id: string;
    title: string;
    summary: string;
    detail?: string;
    blocking: boolean;
  }>;
  hostPlatform?: NodeJS.Platform;
}) {
  return {
    hostPreflightDependencies: {
      getPlatform: () => params.hostPlatform ?? 'darwin',
    },
    async runHostPreflight(options: {
      requestedPlatforms: Array<typeof PLATFORM_ANDROID | typeof PLATFORM_IOS>;
    }) {
      return {
        requestedPlatforms: params.requestedPlatforms ?? options.requestedPlatforms,
        checks: params.reportChecks,
      };
    },
  };
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

test('runDoctorCommand reports missing Android blockers', async () => {
  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctorCommand({
    platform: 'android',
    output,
  }, createDoctorDependencies({
    reportChecks: [
      {
        platform: PLATFORM_ANDROID,
        status: 'error',
        id: 'adb',
        title: 'adb',
        summary: 'Required to communicate with Android devices.',
        detail: 'ADB was not found in ANDROID_HOME, ANDROID_SDK_ROOT, or PATH.',
        blocking: true,
      },
    ],
  }));

  assert.equal(result.success, false);
  assert.match(printed, /Setup Required/);
  assert.match(printed, /adb/);
});

test('runDoctorCommand reports missing iOS blockers', async () => {
  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const result = await runDoctorCommand({
    platform: 'ios',
    output,
  }, createDoctorDependencies({
    reportChecks: [
      {
        platform: PLATFORM_IOS,
        status: 'error',
        id: 'xcrun',
        title: 'xcrun',
        summary: 'Required to access iOS simulator tooling.',
        detail: 'xcrun was not found in PATH.',
        blocking: true,
      },
    ],
  }));

  assert.equal(result.success, false);
  assert.match(printed, /Setup Required/);
  assert.match(printed, /xcrun/);
});

test('runDoctorCommand defaults to both platforms on mac and prints warnings separately', async () => {
  const output = new PassThrough();
  let printed = '';
  output.on('data', (chunk) => {
    printed += chunk.toString();
  });

  const observedPlatforms: Array<typeof PLATFORM_ANDROID | typeof PLATFORM_IOS> = [];
  const result = await runDoctorCommand({
    output,
  }, {
    hostPreflightDependencies: {
      getPlatform: () => 'darwin',
    },
    async runHostPreflight(options) {
      observedPlatforms.push(...options.requestedPlatforms);
      return {
        requestedPlatforms: options.requestedPlatforms,
        checks: [
          {
            platform: PLATFORM_ANDROID,
            status: 'ok',
            id: 'adb',
            title: 'adb',
            summary: 'Required to communicate with Android devices.',
            detail: '/mock/adb',
            blocking: true,
          },
          {
            platform: PLATFORM_IOS,
            status: 'warning',
            id: 'ffmpeg',
            title: 'ffmpeg',
            summary: 'Used to compress iOS recordings after capture.',
            detail: 'ffmpeg was not found in PATH.',
            blocking: false,
          },
        ],
      };
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(observedPlatforms, [PLATFORM_ANDROID, PLATFORM_IOS]);
  assert.match(printed, /Ready/);
  assert.match(printed, /Setup Required\n- None/);
  assert.match(printed, /Warnings/);
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

test('finalrun test requires --model before resolving the workspace environment', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'prod.yaml': '{}\n',
      'staging.yaml': '{}\n',
    },
  });

  try {
    const result = runCli(['test', 'login.yaml'], rootDir);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /--model is required\. Use provider\/model, for example google\/gemini-3-flash-preview\. Supported providers: openai, google, anthropic\./,
    );
    assert.doesNotMatch(result.stderr, /Pass --env <name>\. Available environments:/);
    assert.doesNotMatch(result.stderr, /API key is required/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun test rejects unsupported providers before resolving the workspace environment', async () => {
  const rootDir = createTempWorkspace({
    envFiles: {
      'prod.yaml': '{}\n',
      'staging.yaml': '{}\n',
    },
  });

  try {
    const result = runCli(['test', 'login.yaml', '--model', 'bedrock/claude'], rootDir);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Unsupported AI provider: "bedrock"\. Supported providers: openai, google, anthropic\./,
    );
    assert.doesNotMatch(result.stderr, /Pass --env <name>\. Available environments:/);
    assert.doesNotMatch(result.stderr, /API key is required/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun start-server reports a workspace error outside a FinalRun repo', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-no-workspace-'));

  try {
    const result = runCli(['start-server'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not find a \.finalrun workspace/);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('finalrun report serve remains available as a compatibility alias', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-no-report-workspace-'));

  try {
    const result = runCli(['report', 'serve'], rootDir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not find a \.finalrun workspace/);
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

test('finalrun runs prints a console summary and suggests starting the local report UI', async () => {
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
    assert.match(result.stdout, /finalrun start-server/);
    assert.equal(result.stderr, '');
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});
