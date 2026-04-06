import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunManifest } from '@finalrun/common';
import type { ReportIndexViewModel } from './artifacts';
import { renderRunHtml, renderRunIndexHtml } from './renderers';

function createRunIndexViewModel(): ReportIndexViewModel {
  return {
    generatedAt: '2026-03-24T18:00:00.000Z',
    summary: {
      totalRuns: 2,
      totalSuccessRate: 50,
      totalDurationMs: 22000,
    },
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
        testCount: 2,
        passedCount: 1,
        failedCount: 1,
        stepCount: 4,
        firstFailure: {
          testId: 'login',
          testName: 'login',
          message: 'button not found',
        },
        paths: {
          runJson: '2026-03-24T18-00-00.000Z-dev-android/run.json',
          log: '2026-03-24T18-00-00.000Z-dev-android/runner.log',
        },
        displayName: 'login suite',
        displayKind: 'suite',
        triggeredFrom: 'Suite',
        selectedTestCount: 2,
      },
      {
        runId: '2026-03-24T19-00-00.000Z-dev-android',
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
          runJson: '2026-03-24T19-00-00.000Z-dev-android/run.json',
          log: '2026-03-24T19-00-00.000Z-dev-android/runner.log',
        },
        displayName: 'valid login +2 more',
        displayKind: 'multi_test',
        triggeredFrom: 'Direct',
        selectedTestCount: 3,
      },
    ],
  };
}

function createSuiteRunManifest(): RunManifest {
  return withSnapshotYamlText({
    schemaVersion: 2,
    run: {
      runId: '2026-03-24T18-00-00.000Z-dev-android',
      success: false,
      status: 'failure',
      failurePhase: 'execution',
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
        tests: {
          total: 2,
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
        testId: 'login',
        testName: 'login',
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
        name: 'login suite',
        workspaceSourcePath: '.finalrun/suites/login_suite.yaml',
        snapshotYamlPath: 'input/suite.snapshot.yaml',
        snapshotJsonPath: 'input/suite.json',
        tests: ['login/valid_login.yaml', 'checkout/guest_checkout.yaml'],
        resolvedTestIds: ['login', 'checkout'],
      },
      tests: [
        {
          testId: 'login',
          name: 'valid login',
          relativePath: 'login/valid_login.yaml',
          workspaceSourcePath: '.finalrun/tests/login/valid_login.yaml',
          snapshotYamlPath: 'input/tests/login.yaml',
          snapshotJsonPath: 'input/tests/login.json',
          bindingReferences: {
            variables: [],
            secrets: ['email'],
          },
          setup: [],
          steps: ['Tap login'],
          expected_state: ['Dashboard is visible'],
        },
        {
          testId: 'checkout',
          name: 'guest checkout',
          relativePath: 'checkout/guest_checkout.yaml',
          workspaceSourcePath: '.finalrun/tests/checkout/guest_checkout.yaml',
          snapshotYamlPath: 'input/tests/checkout.yaml',
          snapshotJsonPath: 'input/tests/checkout.json',
          bindingReferences: {
            variables: [],
            secrets: [],
          },
          setup: [],
          steps: ['Open checkout'],
          expected_state: ['Checkout page is visible'],
        },
      ],
      cli: {
        command: 'finalrun test --suite login_suite.yaml',
        selectors: [],
        suitePath: 'login_suite.yaml',
        debug: false,
      },
    },
    tests: [
      {
        testId: 'login',
        testName: 'valid login',
        sourcePath: '/repo/.finalrun/tests/login/valid_login.yaml',
        relativePath: 'login/valid_login.yaml',
        success: false,
        status: 'failure',
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
            stepJsonFile: 'tests/login/actions/001.json',
            videoOffsetMs: 3200,
            analysis: 'The login button was not visible.',
            thought: {
              plan: 'Open the login form.',
              think: 'The login CTA is the fastest way to reach the authenticated screen.',
            },
            actionPayload: {
              direction: 'down',
              repeat: 1,
            },
            trace: {
              step: 1,
              action: 'tap',
              status: 'failure',
              totalMs: 1000,
              spans: [
                {
                  name: 'locate_element',
                  durationMs: 420,
                  startMs: 0,
                  status: 'failure',
                },
              ],
            },
          },
        ],
        workspaceSourcePath: '/repo/.finalrun/tests/login/valid_login.yaml',
        snapshotYamlPath: 'input/tests/login.yaml',
        snapshotJsonPath: 'input/tests/login.json',
        bindingReferences: {
          variables: [],
          secrets: ['email'],
        },
        authored: {
          name: 'valid login',
          setup: [],
          steps: ['Tap login'],
          expected_state: ['Dashboard is visible'],
        },
        effectiveGoal: 'Tap login',
        counts: {
          executionStepsTotal: 1,
          executionStepsPassed: 0,
          executionStepsFailed: 1,
        },
        firstFailure: {
          testId: 'login',
          testName: 'valid login',
          stepNumber: 1,
          actionType: 'tap',
          message: 'button not found',
          screenshotPath: 'tests/login/screenshots/001.jpg',
          stepJsonPath: 'tests/login/actions/001.json',
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
  });
}

function createSingleTestManifest(): RunManifest {
  const suiteManifest = createSuiteRunManifest();
  return withSnapshotYamlText({
    ...suiteManifest,
    run: {
      ...suiteManifest.run,
      runId: '2026-03-24T20-00-00.000Z-dev-android',
      success: true,
      status: 'success',
      target: {
        type: 'direct',
      },
      counts: {
        tests: {
          total: 1,
          passed: 1,
          failed: 0,
        },
        steps: {
          total: 1,
          passed: 1,
          failed: 0,
        },
      },
      firstFailure: undefined,
    },
    input: {
      ...suiteManifest.input,
      suite: undefined,
      tests: [suiteManifest.input.tests[0]],
      cli: {
        command: 'finalrun test login/valid_login.yaml',
        selectors: ['login/valid_login.yaml'],
        debug: false,
      },
    },
    tests: [
      {
        ...suiteManifest.tests[0],
        success: true,
        message: 'All assertions passed',
        analysis: 'Goal completed successfully.',
        durationMs: 4500,
        steps: [
          {
            ...suiteManifest.tests[0].steps[0],
            success: true,
            status: 'success',
            errorMessage: undefined,
          },
        ],
      },
    ],
  });
}

function withSnapshotYamlText(manifest: RunManifest): RunManifest {
  const snapshotByTestId = new Map<string, string>([
    ['login', [
      'name: valid login',
      'steps:',
      '  - Tap login',
      'expected_state:',
      '  - Dashboard is visible',
    ].join('\n')],
    ['checkout', [
      'name: guest checkout',
      'steps:',
      '  - Open checkout',
      'expected_state:',
      '  - Checkout page is visible',
    ].join('\n')],
  ]);

  for (const t of manifest.input.tests) {
    (t as { snapshotYamlText?: string }).snapshotYamlText = snapshotByTestId.get(t.testId!);
  }
  for (const t of manifest.tests) {
    (t as { snapshotYamlText?: string }).snapshotYamlText = snapshotByTestId.get(t.testId);
  }

  return manifest;
}

function extractTestDetailPanel(html: string, testId: string): string {
  const marker = `data-test-panel="${testId}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `Expected test detail panel for ${testId}.`);
  const sectionStart = html.lastIndexOf('<section', start);
  const sectionEnd = html.indexOf('</section>', start);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  return html.slice(sectionStart, sectionEnd + '</section>'.length);
}

function assertTestDetailSectionOrder(html: string, testId: string): void {
  const panel = extractTestDetailPanel(html, testId);
  const testIndex = panel.indexOf('>Test<');
  const runContextIndex = panel.indexOf('>Run Context<');
  const analysisIndex = panel.indexOf('>Analysis<');
  const actionsIndex = panel.indexOf('Agent Actions');
  const recordingIndex = panel.indexOf('Session Recording');

  assert.ok(testIndex >= 0);
  assert.ok(runContextIndex > testIndex);
  assert.ok(analysisIndex > runContextIndex);
  assert.ok(actionsIndex > analysisIndex);
  assert.ok(recordingIndex > actionsIndex);
}

function assertSimplifiedTestDetailHtml(html: string): void {
  assert.match(html, />Test<\/h3>/);
  assert.match(html, /Open raw YAML/);
  assert.match(html, />Run Context<\/h3>/);
  assert.match(html, />Analysis<\/h3>/);
  assert.match(html, /Agent Actions/);
  assert.match(html, /Session Recording/);
  assert.match(html, /function selectNearestStepForTime/);
  assert.match(html, /function findNearestStepIndex/);
  assert.match(html, /selectNearestStepForTime\(testId, nextTime\)/);
  assert.doesNotMatch(html, /Selected Step/);
  assert.doesNotMatch(html, /<h4>Action<\/h4>/);
  assert.doesNotMatch(html, /<h4>Reasoning<\/h4>/);
  assert.doesNotMatch(html, /<h4>Planner Thought<\/h4>/);
  assert.doesNotMatch(html, /<h4>Analysis<\/h4>/);
  assert.doesNotMatch(html, /<h4>Trace<\/h4>/);
  assert.doesNotMatch(html, /<h4>Meta<\/h4>/);
  assert.doesNotMatch(html, /Raw Artifact Links/);
  assert.doesNotMatch(html, /data-role="screenshot"/);
  assert.doesNotMatch(html, /Back to suite list/);
  assert.doesNotMatch(html, /onclick="clearTestSelection\(\)"/);
  assert.doesNotMatch(html, />Goal<\/strong>/);
}

function assertAgentActionListHtml(html: string): void {
  assert.match(html, /class="timeline-scroll"/);
  assert.match(html, /\.timeline-scroll\s*\{/);
  assert.match(html, /class="step-title">Tap login<\/div>/);
  assert.match(html, /\.step-button\.is-selected \.step-expanded\s*\{/);
  assert.match(html, /class="step-reasoning-copy">The login CTA is the fastest way to reach the authenticated screen\.<\/div>/);
  assert.doesNotMatch(html, /class="step-reason"/);
  assert.doesNotMatch(html, /class="step-meta"/);
  assert.doesNotMatch(html, />Grounding<\/div>/);
}

function assertCompactRunContextHtml(html: string): void {
  assert.match(html, /class="run-context-summary"/);
  assert.match(html, /class="context-summary-label">Environment<\/span>/);
  assert.match(html, /class="context-summary-label">Platform<\/span>/);
  assert.match(html, /class="context-summary-label">Model<\/span>/);
  assert.match(html, /class="context-summary-label">App<\/span>/);
  assert.doesNotMatch(html, /class="run-context-grid"/);
  assert.doesNotMatch(html, /class="context-card"/);
  assert.doesNotMatch(html, /<strong>Run Target<\/strong>/);
  assert.doesNotMatch(html, /<strong>Suite<\/strong>/);
  assert.doesNotMatch(html, /<strong>Selectors<\/strong>/);
  assert.doesNotMatch(html, /<strong>Variables<\/strong>/);
  assert.doesNotMatch(html, /<strong>Secrets<\/strong>/);
  assert.doesNotMatch(html, /<strong>Artifacts<\/strong>/);
  assert.doesNotMatch(html, />run\.json<\/a>/);
  assert.doesNotMatch(html, />summary\.json<\/a>/);
  assert.doesNotMatch(html, />runner\.log<\/a>/);
  assert.doesNotMatch(html, />run-context\.json<\/a>/);
}

test('renderRunIndexHtml renders the Flutter-style history table with derived display metadata', () => {
  const html = renderRunIndexHtml(createRunIndexViewModel());

  assert.match(html, /<h1>Test Runs<\/h1>/);
  assert.match(html, /Run history/);
  assert.match(html, /Test Success Rate/);
  assert.match(html, /Triggered From/);
  assert.match(html, /login suite/);
  assert.match(html, /valid login \+2 more/);
  assert.match(html, /Local/);
  assert.match(html, /Suite/);
  assert.match(html, /Direct/);
  assert.match(html, /class="tinted-png-icon"/);
  assert.match(html, /background-color: #707EAE/);
  assert.match(html, /<img class="png-icon" src="data:image\/svg\+xml,/);
  assert.match(html, /\/runs\/2026-03-24T18-00-00\.000Z-dev-android/);
});

test('renderRunHtml renders suite overview, run context, test detail panes, and rewritten artifact links', () => {
  const html = renderRunHtml(createSuiteRunManifest());

  assert.match(html, /<h1 class="report-title">login suite<\/h1>/);
  assert.match(html, /id="suite-overview"/);
  assert.match(html, /Run summary/);
  assert.match(html, /Run Context/);
  assert.match(html, /Executed tests/);
  assert.match(html, /Tests passed/);
  assert.match(html, /Not Executed/);
  assert.match(html, /selectTest\('checkout'\)/);
  assert.match(html, /data-test-panel="login"/);
  assert.match(html, /data-test-panel="checkout"/);
  assert.match(html, /id="primary-back-button"/);
  assert.match(html, /handlePrimaryBack\(event\)/);
  assert.match(html, /data-role="recording-seekbar"/);
  assert.match(html, /data-role="recording-playpause"/);
  assert.doesNotMatch(html, /data-role="recording-fullscreen"/);
  assert.match(html, /<video data-role="recording-video" playsinline preload="metadata"/);
  assert.doesNotMatch(html, /<video data-role="recording-video" controls /);
  assert.match(html, /href="\/"/);
  assert.match(html, /login suite · login\/valid_login\.yaml/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/input\/suite\.snapshot\.yaml/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/tests\/login\/recording\.mp4/);
  assert.match(html, /class="tinted-png-icon"/);
  assert.equal((html.match(/Run history/g) || []).length, 1);
  assert.match(html, /class="context-summary-value">dev<\/div>/);
  assert.match(html, /class="context-summary-value">android<\/div>/);
  assert.match(html, /class="context-summary-value">openai\/gpt-4o<\/div>/);
  assert.match(html, /class="context-summary-value">repo app<\/div>/);
  assert.match(html, /name: valid login/);
  assert.match(html, /name: guest checkout/);
  assertTestDetailSectionOrder(html, 'login');
  assertTestDetailSectionOrder(html, 'checkout');
  assertCompactRunContextHtml(html);
  assertSimplifiedTestDetailHtml(html);
  assertAgentActionListHtml(html);
});

test('renderRunHtml opens directly into the single-test layout for direct one-test runs', () => {
  const html = renderRunHtml(createSingleTestManifest());

  assert.match(html, /<h1 class="report-title">valid login<\/h1>/);
  assert.doesNotMatch(html, /id="suite-overview"/);
  assert.doesNotMatch(html, /Executed tests/);
  assert.doesNotMatch(html, /class="overview-grid"/);
  assert.match(html, /name: valid login/);
  assert.match(html, /id="report-back-button"/);
  assert.match(html, /\/artifacts\/2026-03-24T20-00-00\.000Z-dev-android\/tests\/login\/recording\.mp4/);
  assertTestDetailSectionOrder(html, 'login');
  assert.equal((html.match(/Run history/g) || []).length, 1);
  assertCompactRunContextHtml(html);
  assertSimplifiedTestDetailHtml(html);
  assertAgentActionListHtml(html);
});

test('renderRunHtml renders compact recording empty states without reintroducing debug panels', () => {
  const noRecordingManifest = createSingleTestManifest();
  noRecordingManifest.tests[0] = {
    ...noRecordingManifest.tests[0],
    recordingFile: undefined,
  };

  const noRecordingHtml = renderRunHtml(noRecordingManifest);
  assert.match(noRecordingHtml, /No session recording was captured for this test\./);
  assertSimplifiedTestDetailHtml(noRecordingHtml);

  const noActionsManifest = createSingleTestManifest();
  noActionsManifest.tests[0] = {
    ...noActionsManifest.tests[0],
    steps: [],
  };

  const noActionsHtml = renderRunHtml(noActionsManifest);
  assert.match(noActionsHtml, /No steps were recorded for this test\./);
  assert.match(noActionsHtml, /No recorded actions are available for this test\./);
  assertSimplifiedTestDetailHtml(noActionsHtml);
});

test('renderRunHtml surfaces the no-synced-timestamp caption when steps lack video offsets', () => {
  const manifest = createSingleTestManifest();
  manifest.tests[0] = {
    ...manifest.tests[0],
    steps: manifest.tests[0].steps.map((step) => ({
      ...step,
      videoOffsetMs: undefined,
    })),
  };

  const html = renderRunHtml(manifest);
  assert.match(html, /No synced recording timestamp is available for the selected step\./);
  assertSimplifiedTestDetailHtml(html);
});
