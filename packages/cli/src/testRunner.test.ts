import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  redactResolvedValue,
  type LoadedRepoTestSpec,
  type RuntimeBindings,
} from '@finalrun/common';
import type { GoalResult } from '@finalrun/goal-executor';
import { ReportWriter } from './reportWriter.js';
import { runTests, selectExecutionPlatform, testRunnerDependencies } from './testRunner.js';

function createDevice(platform: string): { getPlatform(): string } {
  return {
    getPlatform() {
      return platform;
    },
  };
}

function createGoalResult(params?: Partial<GoalResult>): GoalResult {
  return {
    success: true,
    message: 'Opened the app successfully.',
    analysis: 'The flow completed successfully.',
    platform: 'android',
    startedAt: '2026-03-17T18:00:00.000Z',
    completedAt: '2026-03-17T18:00:01.000Z',
    totalIterations: 1,
    steps: [
      {
        iteration: 1,
        action: 'tap',
        reason: 'Open the app.',
        naturalLanguageAction: 'Step 1: Open the app.',
        analysis: 'Opened the app from the home screen.',
        thought: {
          plan: 'Bring the app to the foreground.',
          think: 'The flow is ready to execute.',
          act: 'Open the app.',
        },
        actionPayload: {},
        success: true,
        timestamp: '2026-03-17T18:00:00.500Z',
        durationMs: 500,
      },
    ],
    ...params,
  };
}

function createGoalSession(params?: {
  platform?: string;
  cleanup?: () => Promise<void>;
}) {
  return {
    platform: params?.platform ?? 'android',
    deviceInfo: {} as never,
    deviceNode: {} as never,
    device: {} as never,
    async cleanup() {
      await params?.cleanup?.();
    },
  };
}

test('selectExecutionPlatform requires an explicit platform when Android and iOS devices are both available', () => {
  assert.throws(
    () => selectExecutionPlatform([createDevice('android'), createDevice('ios')]),
    /Choose --platform android or --platform ios/,
  );
});

test('selectExecutionPlatform honors the requested platform when it is available', () => {
  const platform = selectExecutionPlatform(
    [createDevice('android'), createDevice('ios')],
    'ios',
  );

  assert.equal(platform, 'ios');
});

test('redactResolvedValue preserves complete placeholders when secrets overlap', () => {
  const redacted = redactResolvedValue('primary=abcd secondary=abc', {
    secrets: {
      short: 'abc',
      long: 'abcd',
    },
    variables: {},
  });

  assert.equal(redacted, 'primary=${secrets.long} secondary=${secrets.short}');
});

test('ReportWriter emits redacted JSON artifacts and the static reasoning-first HTML report', async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-'));
  const writer = new ReportWriter({
    runDir,
    envName: 'staging',
    platform: 'android',
    runId: '2026-03-16T10-30-00.000Z-staging-android',
    bindings: {
      secrets: {
        email: 'person@example.com',
      },
      variables: {
        language: 'Spanish',
      },
    },
  });

  const bindings: RuntimeBindings = {
    secrets: {
      email: 'person@example.com',
    },
    variables: {
      language: 'Spanish',
    },
  };

  const spec: LoadedRepoTestSpec = {
    name: 'login',
    description: 'Verify a user can log in.',
    preconditions: [],
    setup: [],
    steps: ['Enter ${secrets.email} on the login screen.'],
    assertions: ['The feed is visible.'],
    sourcePath: '/repo/.finalrun/tests/auth/login.yaml',
    relativePath: 'auth/login.yaml',
    specId: 'auth__login',
  };

  const screenshot = `data:image/jpeg;base64,${Buffer.from('fake-jpeg-data').toString('base64')}`;
  const recordingPath = path.join(runDir, 'source-recording.mp4');
  const goalResult: GoalResult = {
    success: true,
    message: 'Entered person@example.com and opened the feed.',
    analysis: 'Entered person@example.com and verified the feed.',
    platform: 'android',
    startedAt: '2026-03-16T10:30:00.000Z',
    completedAt: '2026-03-16T10:30:02.000Z',
    totalIterations: 1,
    recording: {
      filePath: recordingPath,
      startedAt: '2026-03-16T10:30:00.000Z',
      completedAt: '2026-03-16T10:30:02.000Z',
    },
    steps: [
      {
        iteration: 1,
        action: 'input_text',
        reason: 'Enter ${secrets.email} on the login screen.',
        naturalLanguageAction: 'Step 1: Enter ${secrets.email}.',
        analysis: 'Typed person@example.com into the email field.',
        thought: {
          plan: 'Focus the email field.',
          think: 'Use the stored login credential.',
          act: 'Enter ${secrets.email}.',
        },
        actionPayload: {
          text: 'person@example.com',
          clearText: true,
        },
        success: true,
        screenshot,
        timestamp: '2026-03-16T10:30:01.000Z',
        durationMs: 1200,
        trace: {
          step: 1,
          action: 'input_text',
          status: 'failure',
          totalMs: 1200,
          failureReason: 'Failed after typing person@example.com.',
          spans: [
            {
              name: 'action.prep',
              startMs: 0,
              durationMs: 150,
              status: 'failure',
              detail: 'device rejected person@example.com',
            },
          ],
        },
        timing: {
          totalMs: 1200,
          spans: [
            {
              name: 'action.device',
              durationMs: 900,
              status: 'failure',
              detail: 'driver echoed person@example.com',
            },
          ],
        },
      },
    ],
  };

  try {
    await fsp.writeFile(recordingPath, 'fake-video-data', 'utf-8');
    await writer.init();
    writer.appendLogLine('report writer smoke check for person@example.com');
    writer.createLoggerSink()({
      level: 1,
      levelName: 'INFO',
      message: 'Planner failed for person@example.com',
      args: [],
      renderedMessage: '[finalrun] Planner failed for person@example.com',
      timestamp: '2026-03-16T10:30:00.500Z',
      tag: 'finalrun',
    });

    const specRecord = await writer.writeSpecRecord(spec, goalResult, bindings);
    await writer.finalize({
      startedAt: goalResult.startedAt,
      completedAt: goalResult.completedAt,
      specs: [specRecord],
    });

    const stepJsonPath = path.join(runDir, 'tests', 'auth__login', 'steps', '001.json');
    const screenshotPath = path.join(runDir, 'tests', 'auth__login', 'screenshots', '001.jpg');
    const recordingArtifactPath = path.join(runDir, 'tests', 'auth__login', 'recording.mp4');
    const resultJsonPath = path.join(runDir, 'tests', 'auth__login', 'result.json');
    const summaryJsonPath = path.join(runDir, 'summary.json');
    const htmlPath = path.join(runDir, 'index.html');
    const runnerLogPath = path.join(runDir, 'runner.log');

    for (const target of [
      stepJsonPath,
      screenshotPath,
      recordingArtifactPath,
      resultJsonPath,
      summaryJsonPath,
      htmlPath,
      runnerLogPath,
    ]) {
      const stats = await fsp.stat(target);
      assert.equal(stats.isFile(), true);
    }

    const stepJson = await fsp.readFile(stepJsonPath, 'utf-8');
    const html = await fsp.readFile(htmlPath, 'utf-8');
    const runnerLog = await fsp.readFile(runnerLogPath, 'utf-8');

    assert.equal(stepJson.includes('person@example.com'), false);
    assert.equal(stepJson.includes('${secrets.email}'), true);
    assert.equal(html.includes('person@example.com'), false);
    assert.equal(html.includes('${secrets.email}'), true);
    assert.equal(stepJson.includes('driver echoed ${secrets.email}'), true);
    assert.equal(html.includes('Reasoning'), true);
    assert.equal(html.includes('Planner Thought'), true);
    assert.equal(html.includes('selectStep('), true);
    assert.equal(html.includes('tests/auth__login/screenshots/001.jpg'), true);
    assert.equal(html.includes('tests/auth__login/recording.mp4'), true);
    assert.equal(html.includes('recording-video'), true);
    assert.equal(stepJson.includes('"videoOffsetMs": 1000'), true);
    assert.equal(runnerLog.includes('person@example.com'), false);
    assert.equal(runnerLog.includes('${secrets.email}'), true);
  } finally {
    await fsp.rm(runDir, { recursive: true, force: true });
  }
});

test('runTests finalizes top-level artifacts when shared-session execution throws before a spec completes', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-runner-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  const secretEnvVar = 'FINALRUN_TEST_EMAIL_SECRET';
  const previousSecret = process.env[secretEnvVar];
  process.env[secretEnvVar] = 'person@example.com';
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(
    path.join(envDir, 'dev.yaml'),
    ['secrets:', `  email: \${${secretEnvVar}}`].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(testsDir, 'login.yaml'),
    [
      'name: login',
      'steps:',
      '  - Enter ${secrets.email} on the login screen.',
    ].join('\n'),
    'utf-8',
  );

  const originalPrepareGoalSession = testRunnerDependencies.prepareGoalSession;
  const originalExecuteGoalOnSession = testRunnerDependencies.executeGoalOnSession;
  let cleanupCalls = 0;

  testRunnerDependencies.prepareGoalSession = async () =>
    createGoalSession({
      cleanup: async () => {
        cleanupCalls += 1;
      },
    });
  testRunnerDependencies.executeGoalOnSession = async () => {
    throw new Error('Driver failed for person@example.com before goal completion');
  };

  try {
    const result = await runTests({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['login.yaml'],
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, false);
    assert.equal(result.specResults.length, 1);
    assert.equal(result.specResults[0]?.success, false);
    assert.equal(
      result.specResults[0]?.message,
      'Driver failed for ${secrets.email} before goal completion',
    );

    const summaryPath = path.join(result.runDir, 'summary.json');
    const indexPath = path.join(result.runDir, 'index.html');
    const resultPath = path.join(result.runDir, 'tests', 'login', 'result.json');
    const stepPath = path.join(result.runDir, 'tests', 'login', 'steps', '001.json');
    const screenshotPath = path.join(
      result.runDir,
      'tests',
      'login',
      'screenshots',
      '001.jpg',
    );
    const runnerLogPath = path.join(result.runDir, 'runner.log');

    for (const target of [
      summaryPath,
      indexPath,
      resultPath,
      stepPath,
      screenshotPath,
      runnerLogPath,
    ]) {
      const stats = await fsp.stat(target);
      assert.equal(stats.isFile(), true);
    }

    const summaryJson = await fsp.readFile(summaryPath, 'utf-8');
    const html = await fsp.readFile(indexPath, 'utf-8');
    const specResultJson = await fsp.readFile(resultPath, 'utf-8');
    const stepJson = await fsp.readFile(stepPath, 'utf-8');
    const runnerLog = await fsp.readFile(runnerLogPath, 'utf-8');

    assert.equal(summaryJson.includes('person@example.com'), false);
    assert.equal(summaryJson.includes('${secrets.email}'), false);
    for (const content of [html, specResultJson, stepJson, runnerLog]) {
      assert.equal(content.includes('person@example.com'), false);
      assert.equal(content.includes('${secrets.email}'), true);
    }
  } finally {
    testRunnerDependencies.prepareGoalSession = originalPrepareGoalSession;
    testRunnerDependencies.executeGoalOnSession = originalExecuteGoalOnSession;
    assert.equal(cleanupCalls, 1);
    await fsp.rm(rootDir, { recursive: true, force: true });
    if (previousSecret === undefined) {
      delete process.env[secretEnvVar];
    } else {
      process.env[secretEnvVar] = previousSecret;
    }
  }
});

test('runTests succeeds without env config when the repo is env-free', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-env-free-runner-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(
    path.join(testsDir, 'smoke.yaml'),
    ['name: smoke', 'steps:', '  - Open the app.'].join('\n'),
    'utf-8',
  );

  const originalPrepareGoalSession = testRunnerDependencies.prepareGoalSession;
  const originalExecuteGoalOnSession = testRunnerDependencies.executeGoalOnSession;
  let cleanupCalls = 0;

  testRunnerDependencies.prepareGoalSession = async () =>
    createGoalSession({
      cleanup: async () => {
        cleanupCalls += 1;
      },
    });
  testRunnerDependencies.executeGoalOnSession = async () =>
    createGoalResult({
      analysis: 'The env-free smoke flow completed successfully.',
    });

  try {
    const result = await runTests({
      cwd: rootDir,
      selectors: ['smoke.yaml'],
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, true);
    assert.equal(result.specResults.length, 1);
    assert.match(result.runDir, /-none-android$/);

    const summaryPath = path.join(result.runDir, 'summary.json');
    const indexPath = path.join(result.runDir, 'index.html');
    const runnerLogPath = path.join(result.runDir, 'runner.log');

    for (const target of [summaryPath, indexPath, runnerLogPath]) {
      const stats = await fsp.stat(target);
      assert.equal(stats.isFile(), true);
    }
  } finally {
    testRunnerDependencies.prepareGoalSession = originalPrepareGoalSession;
    testRunnerDependencies.executeGoalOnSession = originalExecuteGoalOnSession;
    assert.equal(cleanupCalls, 1);
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runTests prepares one shared session for multiple specs and cleans it up once', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-shared-session-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(path.join(envDir, 'dev.yaml'), '{}\n', 'utf-8');
  fs.writeFileSync(
    path.join(testsDir, 'login.yaml'),
    ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(testsDir, 'search.yaml'),
    ['name: search', 'steps:', '  - Search Wikipedia.'].join('\n'),
    'utf-8',
  );

  const originalPrepareGoalSession = testRunnerDependencies.prepareGoalSession;
  const originalExecuteGoalOnSession = testRunnerDependencies.executeGoalOnSession;
  let prepareCalls = 0;
  let cleanupCalls = 0;
  const executedCases: string[] = [];

  testRunnerDependencies.prepareGoalSession = async () => {
    prepareCalls += 1;
    return createGoalSession({
      cleanup: async () => {
        cleanupCalls += 1;
      },
    });
  };
  testRunnerDependencies.executeGoalOnSession = async (_session, config) => {
    if (config.recording) {
      executedCases.push(config.recording.testCaseId);
    }
    return createGoalResult();
  };

  try {
    const result = await runTests({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['login.yaml', 'search.yaml'],
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, true);
    assert.equal(result.specResults.length, 2);
    assert.equal(prepareCalls, 1);
    assert.equal(cleanupCalls, 1);
    assert.deepEqual(executedCases, ['login', 'search']);
  } finally {
    testRunnerDependencies.prepareGoalSession = originalPrepareGoalSession;
    testRunnerDependencies.executeGoalOnSession = originalExecuteGoalOnSession;
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runTests stops the batch after a shared-session failure and cleans up once', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-shared-session-failure-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(path.join(envDir, 'dev.yaml'), '{}\n', 'utf-8');
  fs.writeFileSync(
    path.join(testsDir, 'first.yaml'),
    ['name: first', 'steps:', '  - Open first flow.'].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(testsDir, 'second.yaml'),
    ['name: second', 'steps:', '  - Open second flow.'].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(testsDir, 'third.yaml'),
    ['name: third', 'steps:', '  - Open third flow.'].join('\n'),
    'utf-8',
  );

  const originalPrepareGoalSession = testRunnerDependencies.prepareGoalSession;
  const originalExecuteGoalOnSession = testRunnerDependencies.executeGoalOnSession;
  let cleanupCalls = 0;
  const executedCases: string[] = [];

  testRunnerDependencies.prepareGoalSession = async () =>
    createGoalSession({
      cleanup: async () => {
        cleanupCalls += 1;
      },
    });
  testRunnerDependencies.executeGoalOnSession = async (_session, config) => {
    const testCaseId = config.recording?.testCaseId ?? 'unknown';
    executedCases.push(testCaseId);
    if (testCaseId === 'second') {
      throw new Error('gRPC client not connected');
    }
    return createGoalResult();
  };

  try {
    const result = await runTests({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['first.yaml', 'second.yaml', 'third.yaml'],
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, false);
    assert.equal(result.specResults.length, 2);
    assert.deepEqual(executedCases, ['first', 'second']);
    assert.equal(result.specResults[0]?.success, true);
    assert.equal(result.specResults[1]?.success, false);
    assert.match(result.specResults[1]?.message ?? '', /gRPC client not connected/);
    assert.equal(cleanupCalls, 1);
  } finally {
    testRunnerDependencies.prepareGoalSession = originalPrepareGoalSession;
    testRunnerDependencies.executeGoalOnSession = originalExecuteGoalOnSession;
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runTests writes top-level artifacts when validation fails before platform resolution', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-validation-failure-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(
    path.join(envDir, 'dev.yaml'),
    ['app:', '  android:', '    packageName: org.wikipedia'].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(testsDir, 'login.yaml'),
    ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
    'utf-8',
  );

  try {
    const result = await runTests({
      envName: 'dev',
      cwd: rootDir,
      selectors: ['login.yaml'],
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, false);
    assert.equal(result.specResults.length, 0);

    const summaryPath = path.join(result.runDir, 'summary.json');
    const indexPath = path.join(result.runDir, 'index.html');
    const runnerLogPath = path.join(result.runDir, 'runner.log');

    for (const target of [summaryPath, indexPath, runnerLogPath]) {
      const stats = await fsp.stat(target);
      assert.equal(stats.isFile(), true);
    }

    const summaryJson = await fsp.readFile(summaryPath, 'utf-8');
    const runnerLog = await fsp.readFile(runnerLogPath, 'utf-8');

    assert.equal(summaryJson.includes('"success": false'), true);
    assert.equal(runnerLog.includes('Run validation failed'), true);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});

test('runTests writes failure artifacts when no selectors are provided', async () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-missing-selectors-'));
  const testsDir = path.join(rootDir, '.finalrun', 'tests');
  const envDir = path.join(rootDir, '.finalrun', 'env');
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(path.join(envDir, 'dev.yaml'), '{}\n', 'utf-8');
  fs.writeFileSync(
    path.join(testsDir, 'login.yaml'),
    ['name: login', 'steps:', '  - Open the login screen.'].join('\n'),
    'utf-8',
  );

  try {
    const result = await runTests({
      envName: 'dev',
      cwd: rootDir,
      apiKey: 'test-key',
      provider: 'openai',
      modelName: 'gpt-4o',
    });

    assert.equal(result.success, false);
    assert.equal(result.specResults.length, 0);

    const runnerLogPath = path.join(result.runDir, 'runner.log');
    const runnerLog = await fsp.readFile(runnerLogPath, 'utf-8');
    assert.equal(runnerLog.includes('At least one test selector is required'), true);
  } finally {
    await fsp.rm(rootDir, { recursive: true, force: true });
  }
});
