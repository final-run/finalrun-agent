import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { RunIndexRecord, RunManifestRecord } from '@finalrun/common';
import { renderRunIndexHtml, type ReportIndexViewModel } from './reportIndexTemplate.js';
import { buildReportIndexViewModel, buildReportRunManifestViewModel } from './reportServer.js';
import { renderHtmlReport } from './reportTemplate.js';

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
          runJson: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/run.json',
          log: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/runner.log',
        },
        displayName: 'login suite',
        displayKind: 'suite',
        triggeredFrom: 'Suite',
        selectedSpecCount: 2,
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
        specCount: 3,
        passedCount: 3,
        failedCount: 0,
        stepCount: 6,
        paths: {
          runJson: '/artifacts/2026-03-24T19-00-00.000Z-dev-android/run.json',
          log: '/artifacts/2026-03-24T19-00-00.000Z-dev-android/runner.log',
        },
        displayName: 'valid login +2 more',
        displayKind: 'multi_spec',
        triggeredFrom: 'Direct',
        selectedSpecCount: 3,
      },
    ],
  };
}

function createSuiteRunManifest(): RunManifestRecord {
  return withSnapshotYamlText({
    schemaVersion: 1,
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
        specs: {
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
        specId: 'login',
        specName: 'login',
        message: 'button not found',
        screenshotPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/screenshots/001.jpg',
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
        snapshotYamlPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/suite.snapshot.yaml',
        snapshotJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/suite.json',
        tests: ['login/valid_login.yaml', 'checkout/guest_checkout.yaml'],
        resolvedSpecIds: ['login', 'checkout'],
      },
      specs: [
        {
          specId: 'login',
          specName: 'valid login',
          relativePath: 'login/valid_login.yaml',
          workspaceSourcePath: '.finalrun/tests/login/valid_login.yaml',
          snapshotYamlPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/login.yaml',
          snapshotJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/login.json',
          bindingReferences: {
            variables: [],
            secrets: ['email'],
          },
        },
        {
          specId: 'checkout',
          specName: 'guest checkout',
          relativePath: 'checkout/guest_checkout.yaml',
          workspaceSourcePath: '.finalrun/tests/checkout/guest_checkout.yaml',
          snapshotYamlPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/checkout.yaml',
          snapshotJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/checkout.json',
          bindingReferences: {
            variables: [],
            secrets: [],
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
        recordingFile: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/recording.mp4',
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
            screenshotFile: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/screenshots/001.jpg',
            stepJsonFile: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/steps/001.json',
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
        snapshotYamlPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/login.yaml',
        snapshotJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/specs/login.json',
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
          screenshotPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/screenshots/001.jpg',
          stepJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/steps/001.json',
        },
        previewScreenshotPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/screenshots/001.jpg',
        resultJsonPath: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/tests/login/result.json',
      },
    ],
    paths: {
      runJson: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/run.json',
      summaryJson: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/summary.json',
      log: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/runner.log',
      runContextJson: '/artifacts/2026-03-24T18-00-00.000Z-dev-android/input/run-context.json',
    },
  });
}

function createSingleSpecManifest(): RunManifestRecord {
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
        specs: {
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
      specs: [suiteManifest.input.specs[0]],
      cli: {
        command: 'finalrun test login/valid_login.yaml',
        selectors: ['login/valid_login.yaml'],
        debug: false,
      },
    },
    specs: [
      {
        ...suiteManifest.specs[0],
        success: true,
        message: 'All assertions passed',
        analysis: 'Goal completed successfully.',
        durationMs: 4500,
        recordingFile: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/tests/login/recording.mp4',
        resultJsonPath: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/tests/login/result.json',
        snapshotYamlPath: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/input/specs/login.yaml',
        snapshotJsonPath: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/input/specs/login.json',
        steps: [
          {
            ...suiteManifest.specs[0].steps[0],
            success: true,
            status: 'success',
            errorMessage: undefined,
            screenshotFile: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/tests/login/screenshots/001.jpg',
            stepJsonFile: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/tests/login/steps/001.json',
          },
        ],
      },
    ],
    paths: {
      ...suiteManifest.paths,
      runJson: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/run.json',
      summaryJson: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/summary.json',
      log: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/runner.log',
      runContextJson: '/artifacts/2026-03-24T20-00-00.000Z-dev-android/input/run-context.json',
    },
  });
}

function withSnapshotYamlText(manifest: RunManifestRecord): RunManifestRecord {
  const snapshotBySpecId = new Map<string, string>([
    ['login', [
      'name: valid login',
      'steps:',
      '  - Tap login',
      'assertions:',
      '  - Dashboard is visible',
    ].join('\n')],
    ['checkout', [
      'name: guest checkout',
      'steps:',
      '  - Open checkout',
      'assertions:',
      '  - Checkout page is visible',
    ].join('\n')],
  ]);

  for (const spec of manifest.input.specs) {
    (spec as { snapshotYamlText?: string }).snapshotYamlText = snapshotBySpecId.get(spec.specId);
  }
  for (const spec of manifest.specs) {
    (spec as { snapshotYamlText?: string }).snapshotYamlText = snapshotBySpecId.get(spec.specId);
  }

  return manifest;
}

function extractSpecDetailPanel(html: string, specId: string): string {
  const marker = `data-spec-panel="${specId}"`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `Expected spec detail panel for ${specId}.`);
  const sectionStart = html.lastIndexOf('<section', start);
  const sectionEnd = html.indexOf('</section>', start);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  return html.slice(sectionStart, sectionEnd + '</section>'.length);
}

function assertSpecDetailSectionOrder(html: string, specId: string): void {
  const panel = extractSpecDetailPanel(html, specId);
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

function assertSimplifiedSpecDetailHtml(html: string): void {
  assert.match(html, />Test<\/h3>/);
  assert.match(html, /Open raw YAML/);
  assert.match(html, />Run Context<\/h3>/);
  assert.match(html, />Analysis<\/h3>/);
  assert.match(html, /Agent Actions/);
  assert.match(html, /Session Recording/);
  assert.match(html, /function selectNearestStepForTime/);
  assert.match(html, /function findNearestStepIndex/);
  assert.match(html, /selectNearestStepForTime\(specId, nextTime\)/);
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
  assert.doesNotMatch(html, /onclick="clearSpecSelection\(\)"/);
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

test('renderRunIndexHtml renders the Flutter-style history table on the live CLI server path', () => {
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

test('renderHtmlReport renders the new suite report layout on the live CLI server path', () => {
  const html = renderHtmlReport(createSuiteRunManifest());

  assert.match(html, /<h1 class="report-title">login suite<\/h1>/);
  assert.match(html, /id="suite-overview"/);
  assert.match(html, /Run summary/);
  assert.match(html, /Run Context/);
  assert.match(html, /Executed tests/);
  assert.match(html, /Tests passed/);
  assert.match(html, /Not Executed/);
  assert.match(html, /selectSpec\('checkout'\)/);
  assert.match(html, /data-spec-panel="login"/);
  assert.match(html, /data-spec-panel="checkout"/);
  assert.match(html, /id="primary-back-button"/);
  assert.match(html, /handlePrimaryBack\(event\)/);
  assert.match(html, /data-role="recording-seekbar"/);
  assert.match(html, /data-role="recording-playpause"/);
  assert.match(html, /data-role="recording-fullscreen"/);
  assert.match(html, /<video data-role="recording-video" playsinline preload="metadata"/);
  assert.doesNotMatch(html, /<video data-role="recording-video" controls /);
  assert.match(html, /href="\/"/);
  assert.match(html, /login suite · login\/valid_login\.yaml/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/input\/suite\.snapshot\.yaml/);
  assert.match(html, /\/artifacts\/2026-03-24T18-00-00\.000Z-dev-android\/tests\/login\/recording\.mp4/);
  assert.equal((html.match(/Run history/g) || []).length, 1);
  assert.match(html, /class="context-summary-value">dev<\/div>/);
  assert.match(html, /class="context-summary-value">android<\/div>/);
  assert.match(html, /class="context-summary-value">openai\/gpt-4o<\/div>/);
  assert.match(html, /class="context-summary-value">repo app<\/div>/);
  assert.match(html, /name: valid login/);
  assert.match(html, /name: guest checkout/);
  assertSpecDetailSectionOrder(html, 'login');
  assertSpecDetailSectionOrder(html, 'checkout');
  assertCompactRunContextHtml(html);
  assert.match(html, /class="tinted-png-icon"/);
  assertSimplifiedSpecDetailHtml(html);
  assertAgentActionListHtml(html);
});

test('renderHtmlReport opens directly into the single-spec layout for one-spec direct runs', () => {
  const html = renderHtmlReport(createSingleSpecManifest());

  assert.match(html, /<h1 class="report-title">valid login<\/h1>/);
  assert.doesNotMatch(html, /id="suite-overview"/);
  assert.doesNotMatch(html, /Executed tests/);
  assert.doesNotMatch(html, /class="overview-grid"/);
  assert.match(html, /name: valid login/);
  assert.match(html, /id="report-back-button"/);
  assert.match(html, /\/artifacts\/2026-03-24T20-00-00\.000Z-dev-android\/tests\/login\/recording\.mp4/);
  assertSpecDetailSectionOrder(html, 'login');
  assert.equal((html.match(/Run history/g) || []).length, 1);
  assertCompactRunContextHtml(html);
  assertSimplifiedSpecDetailHtml(html);
  assertAgentActionListHtml(html);
});

test('renderHtmlReport renders compact recording empty states without reintroducing debug panels', () => {
  const noRecordingManifest = createSingleSpecManifest();
  noRecordingManifest.specs[0] = {
    ...noRecordingManifest.specs[0],
    recordingFile: undefined,
  };

  const noRecordingHtml = renderHtmlReport(noRecordingManifest);
  assert.match(noRecordingHtml, /No session recording was captured for this spec\./);
  assertSimplifiedSpecDetailHtml(noRecordingHtml);

  const noActionsManifest = createSingleSpecManifest();
  noActionsManifest.specs[0] = {
    ...noActionsManifest.specs[0],
    steps: [],
  };

  const noActionsHtml = renderHtmlReport(noActionsManifest);
  assert.match(noActionsHtml, /No steps were recorded for this spec\./);
  assert.match(noActionsHtml, /No recorded actions are available for this spec\./);
  assertSimplifiedSpecDetailHtml(noActionsHtml);
});

test('renderHtmlReport surfaces the no-synced-timestamp caption when steps lack video offsets', () => {
  const manifest = createSingleSpecManifest();
  manifest.specs[0] = {
    ...manifest.specs[0],
    steps: manifest.specs[0].steps.map((step) => ({
      ...step,
      videoOffsetMs: undefined,
    })),
  };

  const html = renderHtmlReport(manifest);
  assert.match(html, /No synced recording timestamp is available for the selected step\./);
  assertSimplifiedSpecDetailHtml(html);
});

test('buildReportIndexViewModel derives display metadata for the actual CLI-served history page', async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-report-'));

  try {
    const index: RunIndexRecord = {
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
          specCount: 2,
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
          specCount: 3,
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
          specCount: 0,
          passedCount: 0,
          failedCount: 0,
          stepCount: 0,
          paths: {
            runJson: 'early-failure-run/run.json',
            log: 'early-failure-run/runner.log',
          },
        },
      ],
    };

    await writeRunManifest(artifactsDir, {
      runId: 'suite-run',
      target: {
        type: 'suite',
        suiteId: 'smoke',
        suiteName: 'Smoke Suite',
        suitePath: 'smoke.yaml',
      },
      selectedSpecs: [
        { specId: 'login', specName: 'Valid login', relativePath: 'login/valid_login.yaml' },
        { specId: 'checkout', specName: 'Guest checkout', relativePath: 'checkout/guest_checkout.yaml' },
      ],
      suite: {
        suiteId: 'smoke',
        suiteName: 'Smoke Suite',
        workspaceSourcePath: '.finalrun/suites/smoke.yaml',
        snapshotYamlPath: 'input/suite.snapshot.yaml',
        snapshotJsonPath: 'input/suite.json',
        tests: ['login/valid_login.yaml', 'checkout/guest_checkout.yaml'],
        resolvedSpecIds: ['login', 'checkout'],
      },
    });

    await writeRunManifest(artifactsDir, {
      runId: 'direct-run',
      target: {
        type: 'direct',
      },
      selectedSpecs: [
        { specId: 'login', specName: 'Valid login', relativePath: 'login/valid_login.yaml' },
        { specId: 'signup', specName: 'Valid signup', relativePath: 'auth/valid_signup.yaml' },
        { specId: 'logout', specName: 'Logout', relativePath: 'auth/logout.yaml' },
      ],
    });

    const viewModel = await buildReportIndexViewModel(index, artifactsDir);

    assert.equal(viewModel.summary.totalRuns, 3);
    assert.equal(viewModel.summary.totalDurationMs, 24000);
    assert.ok(Math.abs(viewModel.summary.totalSuccessRate - 100 / 3) < 1e-9);

    assert.deepEqual(
      viewModel.runs.map((run) => ({
        runId: run.runId,
        displayName: run.displayName,
        displayKind: run.displayKind,
        triggeredFrom: run.triggeredFrom,
        selectedSpecCount: run.selectedSpecCount,
        runJson: run.paths.runJson,
      })),
      [
        {
          runId: 'suite-run',
          displayName: 'Smoke Suite',
          displayKind: 'suite',
          triggeredFrom: 'Suite',
          selectedSpecCount: 2,
          runJson: '/artifacts/suite-run/run.json',
        },
        {
          runId: 'direct-run',
          displayName: 'Valid login +2 more',
          displayKind: 'multi_spec',
          triggeredFrom: 'Direct',
          selectedSpecCount: 3,
          runJson: '/artifacts/direct-run/run.json',
        },
        {
          runId: 'early-failure-run',
          displayName: 'early-failure-run',
          displayKind: 'fallback',
          triggeredFrom: 'Direct',
          selectedSpecCount: 0,
          runJson: '/artifacts/early-failure-run/run.json',
        },
      ],
    );
  } finally {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  }
});

test('buildReportRunManifestViewModel inlines snapshot YAML text and scopes snapshot artifact paths', async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-cli-report-run-'));

  try {
    await writeRunManifest(artifactsDir, {
      runId: 'yaml-run',
      target: {
        type: 'direct',
      },
      selectedSpecs: [
        { specId: 'login', specName: 'Valid login', relativePath: 'login/valid_login.yaml' },
      ],
    });
    await fsp.mkdir(path.join(artifactsDir, 'yaml-run', 'input', 'specs'), { recursive: true });
    await fsp.writeFile(
      path.join(artifactsDir, 'yaml-run', 'input', 'specs', 'login.yaml'),
      ['name: valid login', 'steps:', '  - Tap login'].join('\n'),
      'utf-8',
    );

    const rawManifest = JSON.parse(
      await fsp.readFile(path.join(artifactsDir, 'yaml-run', 'run.json'), 'utf-8'),
    ) as RunManifestRecord;
    const viewModel = await buildReportRunManifestViewModel(rawManifest, artifactsDir);

    assert.equal(viewModel.input.specs[0]?.snapshotYamlPath, '/artifacts/yaml-run/input/specs/login.yaml');
    assert.equal(viewModel.input.specs[0]?.snapshotYamlText, ['name: valid login', 'steps:', '  - Tap login'].join('\n'));
    assert.equal(viewModel.paths.runJson, '/artifacts/yaml-run/run.json');
  } finally {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  }
});


async function writeRunManifest(
  artifactsDir: string,
  params: {
    runId: string;
    target: {
      type: 'direct' | 'suite';
      suiteId?: string;
      suiteName?: string;
      suitePath?: string;
    };
    selectedSpecs: Array<{
      specId: string;
      specName: string;
      relativePath: string;
    }>;
    suite?: {
      suiteId: string;
      suiteName: string;
      workspaceSourcePath: string;
      snapshotYamlPath: string;
      snapshotJsonPath: string;
      tests: string[];
      resolvedSpecIds: string[];
    };
  },
): Promise<void> {
  await fsp.mkdir(path.join(artifactsDir, params.runId), { recursive: true });
  await fsp.writeFile(
    path.join(artifactsDir, params.runId, 'run.json'),
    JSON.stringify({
      schemaVersion: 1,
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
          ? params.selectedSpecs.map((spec) => spec.relativePath)
          : [],
        target: params.target,
        counts: {
          specs: {
            total: params.selectedSpecs.length,
            passed: params.target.type === 'direct' ? params.selectedSpecs.length : 0,
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
        specs: params.selectedSpecs.map((spec) => ({
          ...spec,
          workspaceSourcePath: `.finalrun/tests/${spec.relativePath}`,
          snapshotYamlPath: `input/specs/${spec.specId}.yaml`,
          snapshotJsonPath: `input/specs/${spec.specId}.json`,
          bindingReferences: {
            variables: [],
            secrets: [],
          },
        })),
        cli: {
          command: params.target.type === 'suite'
            ? `finalrun test --suite ${params.target.suitePath || 'suite.yaml'}`
            : `finalrun test ${params.selectedSpecs.map((spec) => spec.relativePath).join(' ')}`,
          selectors: params.target.type === 'direct'
            ? params.selectedSpecs.map((spec) => spec.relativePath)
            : [],
          suitePath: params.target.type === 'suite' ? params.target.suitePath : undefined,
          debug: false,
        },
      },
      specs: [],
      paths: {
        runJson: 'run.json',
        summaryJson: 'summary.json',
        log: 'runner.log',
      },
    }, null, 2),
    'utf-8',
  );
}
