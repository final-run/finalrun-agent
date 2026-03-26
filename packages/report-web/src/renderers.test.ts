import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunIndexRecord, RunManifestRecord } from '@finalrun/common';
import { renderRunHtml, renderRunIndexHtml } from './renderers';

function createRunIndex(): RunIndexRecord {
  return {
    schemaVersion: 1,
    generatedAt: '2026-03-24T18:00:00.000Z',
    runs: [
      {
        runId: '2026-03-24T18-00-00.000Z-dev-android',
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
          suiteId: 'login_suite',
          suiteName: 'login suite',
          suitePath: 'login_suite.yaml',
        },
        specCount: 2,
        passedCount: 1,
        failedCount: 1,
        stepCount: 4,
        firstFailure: {
          specId: 'login',
          specName: 'login',
          message: 'button not found',
        },
        paths: {
          runJson: '2026-03-24T18-00-00.000Z-dev-android/run.json',
          log: '2026-03-24T18-00-00.000Z-dev-android/runner.log',
        },
      },
    ],
  };
}

function createRunManifest(): RunManifestRecord {
  return {
    schemaVersion: 1,
    run: {
      runId: '2026-03-24T18-00-00.000Z-dev-android',
      success: false,
      status: 'failure',
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
      selectors: [],
      target: {
        type: 'suite',
        suiteId: 'login_suite',
        suiteName: 'login suite',
        suitePath: 'login_suite.yaml',
      },
      counts: {
        specs: {
          total: 1,
          passed: 0,
          failed: 1,
        },
        steps: {
          total: 1,
          passed: 0,
          failed: 1,
        },
      },
      firstFailure: {
        specId: 'login',
        specName: 'login',
        message: 'button not found',
        screenshotPath: 'tests/login/screenshots/001.jpg',
      },
    },
    input: {
      environment: {
        envName: 'dev',
        variables: {
          locale: 'en-US',
        },
        secretReferences: [
          {
            key: 'email',
            envVar: 'FINALRUN_TEST_EMAIL',
          },
        ],
      },
      suite: {
        suiteId: 'login_suite',
        suiteName: 'login suite',
        workspaceSourcePath: '.finalrun/suites/login_suite.yaml',
        snapshotYamlPath: 'input/suite.snapshot.yaml',
        snapshotJsonPath: 'input/suite.json',
        tests: ['login/valid_login.yaml', 'dashboard/**'],
        resolvedSpecIds: ['login'],
      },
      specs: [
        {
          specId: 'login',
          specName: 'valid login',
          relativePath: 'login/valid_login.yaml',
          workspaceSourcePath: '.finalrun/tests/login/valid_login.yaml',
          snapshotYamlPath: 'input/specs/login.yaml',
          snapshotJsonPath: 'input/specs/login.json',
          bindingReferences: {
            variables: [],
            secrets: ['email'],
          },
        },
      ],
      cli: {
        command: 'finalrun test --suite login_suite.yaml',
        selectors: [],
        suitePath: 'login_suite.yaml',
        debug: false,
      },
    },
    specs: [
      {
        specId: 'login',
        specName: 'valid login',
        sourcePath: '/repo/.finalrun/tests/login/valid_login.yaml',
        relativePath: 'login/valid_login.yaml',
        success: false,
        message: 'button not found',
        analysis: 'button not found',
        platform: 'android',
        startedAt: '2026-03-24T18:00:00.000Z',
        completedAt: '2026-03-24T18:00:10.000Z',
        durationMs: 10000,
        recordingFile: 'tests/login/recording.mp4',
        steps: [
          {
            stepNumber: 1,
            iteration: 1,
            actionType: 'tap',
            naturalLanguageAction: 'Tap login',
            reason: 'Open the login form.',
            success: false,
            status: 'failure',
            errorMessage: 'button not found',
            durationMs: 1000,
            timestamp: '2026-03-24T18:00:05.000Z',
            screenshotFile: 'tests/login/screenshots/001.jpg',
            stepJsonFile: 'tests/login/steps/001.json',
          },
        ],
        workspaceSourcePath: '/repo/.finalrun/tests/login/valid_login.yaml',
        snapshotYamlPath: 'input/specs/login.yaml',
        snapshotJsonPath: 'input/specs/login.json',
        bindingReferences: {
          variables: [],
          secrets: ['email'],
        },
        authored: {
          name: 'valid login',
          preconditions: [],
          setup: [],
          steps: ['Tap login'],
          assertions: ['Dashboard is visible'],
        },
        effectiveGoal: 'Tap login',
        counts: {
          executionStepsTotal: 1,
          executionStepsPassed: 0,
          executionStepsFailed: 1,
        },
        firstFailure: {
          specId: 'login',
          specName: 'valid login',
          stepNumber: 1,
          actionType: 'tap',
          message: 'button not found',
          screenshotPath: 'tests/login/screenshots/001.jpg',
          stepJsonPath: 'tests/login/steps/001.json',
        },
        previewScreenshotPath: 'tests/login/screenshots/001.jpg',
        resultJsonPath: 'tests/login/result.json',
      },
    ],
    paths: {
      runJson: 'run.json',
      summaryJson: 'summary.json',
      log: 'runner.log',
      runContextJson: 'input/run-context.json',
    },
  };
}

test('renderRunIndexHtml links dynamic run routes and artifact files from persisted runs.json data', () => {
  const html = renderRunIndexHtml(createRunIndex());

  assert.match(html, /FinalRun Reports/);
  assert.match(html, /login suite/);
  assert.match(html, /return '\/runs\/' \+ encodeURIComponent\(run\.runId\)/);
  assert.match(html, /run\.paths\.runJson/);
  assert.match(html, /run\.paths\.log/);
});

test('renderRunHtml rewrites run-scoped artifact links for the local report server', () => {
  const html = renderRunHtml(createRunManifest());

  assert.match(html, /FinalRun Local Report/);
  assert.match(html, /Run Target/);
  assert.match(html, /Suite Tests/);
  assert.match(html, /login suite/);
  assert.match(html, /\.media-shell \{\s+width: min\(100%, 360px\)/);
  assert.match(html, /\.recording-shell \{\s+aspect-ratio: var\(--recording-aspect-ratio, 9 \/ 19\.5\)/);
  assert.match(html, /\.screenshot-shell \{\s+aspect-ratio: 9 \/ 19\.5/);
  assert.match(html, /<div class="media-shell screenshot-shell">/);
  assert.match(html, /class="recording-icon-button primary"/);
  assert.match(html, /data-role="recording-seekbar"/);
  assert.match(html, /data-role="recording-playpause"/);
  assert.match(html, /data-role="recording-fullscreen"/);
  assert.match(html, /<video data-role="recording-video" playsinline preload="metadata"/);
  assert.doesNotMatch(html, /<video data-role="recording-video" controls /);
  assert.match(html, /--recording-aspect-ratio/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/run\.json/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/input\/suite\.snapshot\.yaml/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/tests\/login\/steps\/001\.json/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/tests\/login\/recording\.mp4/);
});
