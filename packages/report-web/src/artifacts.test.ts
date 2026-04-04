import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ArtifactRangeNotSatisfiableError,
  loadArtifactResponse,
  loadReportIndexViewModel,
  loadReportRunManifestViewModel,
  type ReportWorkspaceContext,
} from './artifacts';

interface TestWorkspaceContext extends ReportWorkspaceContext {
  storageRoot: string;
}

function createWorkspaceContext(): TestWorkspaceContext {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-artifacts-'));
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-storage-'));
  const artifactsDir = path.join(storageRoot, '.finalrun', 'workspaces', 'workspace-hash', 'artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  return {
    workspaceRoot,
    storageRoot,
    artifactsDir,
  };
}

async function cleanupWorkspaceContext(context: TestWorkspaceContext): Promise<void> {
  await fsp.rm(context.workspaceRoot, { recursive: true, force: true });
  await fsp.rm(context.storageRoot, { recursive: true, force: true });
}

test('loadArtifactResponse returns full-file headers for artifact reads', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await loadArtifactResponse(['runs', 'clip.mp4'], undefined, context);

    assert.equal(response.status, 200);
    assert.equal(response.contentType, 'video/mp4');
    assert.equal(response.headers['accept-ranges'], 'bytes');
    assert.equal(response.headers['content-length'], '10');
    assert.equal(response.headers['content-type'], 'video/mp4');
  } finally {
    await cleanupWorkspaceContext(context);
  }
});

test('loadReportIndexViewModel derives display metadata from persisted run manifests without changing shared schemas', async () => {
  const context = createWorkspaceContext();

  try {
    await writeJson(path.join(context.artifactsDir, 'runs.json'), {
      schemaVersion: 1,
      generatedAt: '2026-03-24T18:00:00.000Z',
      runs: [
        {
          runId: 'suite-run',
          success: false,
          status: 'failure',
          startedAt: '2026-03-24T18:00:00.000Z',
          completedAt: '2026-03-24T18:00:10.000Z',
          durationMs: 10000,
          envName: 'dev',
          platform: 'android',
          modelLabel: 'openai/gpt-4o',
          appLabel: 'repo app',
          target: {
            type: 'suite',
            suiteId: 'smoke',
            suiteName: 'Smoke Suite',
            suitePath: 'smoke.yaml',
          },
          testCount: 2,
          passedCount: 1,
          failedCount: 1,
          stepCount: 4,
          paths: {
            runJson: 'suite-run/run.json',
            log: 'suite-run/runner.log',
          },
        },
        {
          runId: 'direct-run',
          success: true,
          status: 'success',
          startedAt: '2026-03-24T19:00:00.000Z',
          completedAt: '2026-03-24T19:00:12.000Z',
          durationMs: 12000,
          envName: 'dev',
          platform: 'android',
          modelLabel: 'openai/gpt-4o',
          appLabel: 'repo app',
          target: {
            type: 'direct',
          },
          testCount: 3,
          passedCount: 3,
          failedCount: 0,
          stepCount: 6,
          paths: {
            runJson: 'direct-run/run.json',
            log: 'direct-run/runner.log',
          },
        },
        {
          runId: 'early-failure-run',
          success: false,
          status: 'failure',
          startedAt: '2026-03-24T20:00:00.000Z',
          completedAt: '2026-03-24T20:00:02.000Z',
          durationMs: 2000,
          envName: 'dev',
          platform: 'android',
          modelLabel: 'openai/gpt-4o',
          appLabel: 'repo app',
          target: {
            type: 'direct',
          },
          testCount: 0,
          passedCount: 0,
          failedCount: 0,
          stepCount: 0,
          paths: {
            runJson: 'early-failure-run/run.json',
            log: 'early-failure-run/runner.log',
          },
        },
      ],
    });

    await writeRunManifest(context, {
      runId: 'suite-run',
      target: {
        type: 'suite',
        suiteId: 'smoke',
        suiteName: 'Smoke Suite',
        suitePath: 'smoke.yaml',
      },
      selectedTests: [
        { testId: 'login', name: 'Valid login', relativePath: 'login/valid_login.yaml' },
        { testId: 'checkout', name: 'Guest checkout', relativePath: 'checkout/guest_checkout.yaml' },
      ],
      suite: {
        suiteId: 'smoke',
        name: 'Smoke Suite',
        workspaceSourcePath: '.finalrun/suites/smoke.yaml',
        snapshotYamlPath: 'input/suite.snapshot.yaml',
        snapshotJsonPath: 'input/suite.json',
        tests: ['login/valid_login.yaml', 'checkout/guest_checkout.yaml'],
        resolvedTestIds: ['login', 'checkout'],
      },
    });

    await writeRunManifest(context, {
      runId: 'direct-run',
      target: {
        type: 'direct',
      },
      selectedTests: [
        { testId: 'login', name: 'Valid login', relativePath: 'login/valid_login.yaml' },
        { testId: 'signup', name: 'Valid signup', relativePath: 'auth/valid_signup.yaml' },
        { testId: 'logout', name: 'Logout', relativePath: 'auth/logout.yaml' },
      ],
    });

    const viewModel = await loadReportIndexViewModel(context);

    assert.equal(viewModel.summary.totalRuns, 3);
    assert.equal(viewModel.summary.totalDurationMs, 24000);
    assert.ok(Math.abs(viewModel.summary.totalSuccessRate - 100 / 3) < 1e-9);

    assert.deepEqual(
      viewModel.runs.map((run) => ({
        runId: run.runId,
        displayName: run.displayName,
        displayKind: run.displayKind,
        triggeredFrom: run.triggeredFrom,
        selectedTestCount: run.selectedTestCount,
      })),
      [
        {
          runId: 'suite-run',
          displayName: 'Smoke Suite',
          displayKind: 'suite',
          triggeredFrom: 'Suite',
          selectedTestCount: 2,
        },
        {
          runId: 'direct-run',
          displayName: 'Valid login +2 more',
          displayKind: 'multi_test',
          triggeredFrom: 'Direct',
          selectedTestCount: 3,
        },
        {
          runId: 'early-failure-run',
          displayName: 'early-failure-run',
          displayKind: 'fallback',
          triggeredFrom: 'Direct',
          selectedTestCount: 0,
        },
      ],
    );
  } finally {
    await cleanupWorkspaceContext(context);
  }
});

test('loadReportRunManifestViewModel inlines snapshot YAML text for test detail rendering', async () => {
  const context = createWorkspaceContext();

  try {
    await writeRunManifest(context, {
      runId: 'yaml-run',
      target: {
        type: 'direct',
      },
      selectedTests: [
        { testId: 'login', name: 'Valid login', relativePath: 'login/valid_login.yaml' },
      ],
    });
    await fsp.mkdir(path.join(context.artifactsDir, 'yaml-run', 'input', 'tests'), { recursive: true });
    await fsp.writeFile(
      path.join(context.artifactsDir, 'yaml-run', 'input', 'tests', 'login.yaml'),
      ['name: valid login', 'steps:', '  - Tap login'].join('\n'),
      'utf-8',
    );

    const manifest = await loadReportRunManifestViewModel('yaml-run', context);

    assert.equal(manifest.input.tests[0]?.snapshotYamlPath, 'input/tests/login.yaml');
    assert.equal(manifest.input.tests[0]?.snapshotYamlText, ['name: valid login', 'steps:', '  - Tap login'].join('\n'));
    assert.equal(manifest.tests.length, 0);
  } finally {
    await cleanupWorkspaceContext(context);
  }
});


async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

async function writeRunManifest(
  context: ReportWorkspaceContext,
  params: {
    runId: string;
    target: {
      type: 'direct' | 'suite';
      suiteId?: string;
      suiteName?: string;
      suitePath?: string;
    };
    selectedTests: Array<{
      testId: string;
      name: string;
      relativePath: string;
    }>;
    suite?: {
      suiteId: string;
      name: string;
      workspaceSourcePath: string;
      snapshotYamlPath: string;
      snapshotJsonPath: string;
      tests: string[];
      resolvedTestIds: string[];
    };
  },
): Promise<void> {
  await writeJson(path.join(context.artifactsDir, params.runId, 'run.json'), {
    schemaVersion: 2,
    run: {
      runId: params.runId,
      success: params.target.type === 'direct',
      status: params.target.type === 'direct' ? 'success' : 'failure',
      startedAt: '2026-03-24T18:00:00.000Z',
      completedAt: '2026-03-24T18:00:10.000Z',
      durationMs: 10000,
      envName: 'dev',
      platform: 'android',
      model: {
        provider: 'openai',
        modelName: 'gpt-4o',
        label: 'openai/gpt-4o',
      },
      app: {
        source: 'repo',
        label: 'repo app',
      },
      selectors: params.target.type === 'direct'
        ? params.selectedTests.map((t) => t.relativePath)
        : [],
      target: params.target,
      counts: {
        tests: {
          total: params.selectedTests.length,
          passed: params.target.type === 'direct' ? params.selectedTests.length : 0,
          failed: params.target.type === 'direct' ? 0 : 1,
        },
        steps: {
          total: 0,
          passed: 0,
          failed: 0,
        },
      },
    },
    input: {
      environment: {
        envName: 'dev',
        variables: {},
        secretReferences: [],
      },
      suite: params.suite,
      tests: params.selectedTests.map((t) => ({
        ...t,
        workspaceSourcePath: `.finalrun/tests/${t.relativePath}`,
        snapshotYamlPath: `input/tests/${t.testId}.yaml`,
        snapshotJsonPath: `input/tests/${t.testId}.json`,
        bindingReferences: {
          variables: [],
          secrets: [],
        },
        setup: [],
        steps: [],
        assertions: [],
      })),
      cli: {
        command: params.target.type === 'suite'
          ? `finalrun test --suite ${params.target.suitePath || 'suite.yaml'}`
          : `finalrun test ${params.selectedTests.map((t) => t.relativePath).join(' ')}`,
        selectors: params.target.type === 'direct'
          ? params.selectedTests.map((t) => t.relativePath)
          : [],
        suitePath: params.target.type === 'suite' ? params.target.suitePath : undefined,
        debug: false,
      },
    },
    tests: [],
    paths: {
      runJson: 'run.json',
      summaryJson: 'summary.json',
      log: 'runner.log',
    },
  });
}

test('loadArtifactResponse serves byte ranges for seekable media playback', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    const response = await loadArtifactResponse(['runs', 'clip.mp4'], 'bytes=2-5', context);

    assert.equal(response.status, 206);
    assert.equal(response.headers['accept-ranges'], 'bytes');
    assert.equal(response.headers['content-length'], '4');
    assert.equal(response.headers['content-range'], 'bytes 2-5/10');
  } finally {
    await cleanupWorkspaceContext(context);
  }
});

test('loadArtifactResponse rejects byte ranges outside the artifact size', async () => {
  const context = createWorkspaceContext();
  const artifactPath = path.join(context.artifactsDir, 'runs', 'clip.mp4');

  try {
    await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
    await fsp.writeFile(artifactPath, Buffer.from('0123456789', 'utf-8'));

    await assert.rejects(
      loadArtifactResponse(['runs', 'clip.mp4'], 'bytes=25-30', context),
      (error: unknown) => {
        assert.ok(error instanceof ArtifactRangeNotSatisfiableError);
        assert.equal(error.size, 10);
        return true;
      },
    );
  } finally {
    await cleanupWorkspaceContext(context);
  }
});
