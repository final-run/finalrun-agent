import assert from 'node:assert/strict';
import { get } from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { RunManifestRecord } from '@finalrun/common';
import { serveReportArtifacts } from './reportServer.js';
import { rebuildRunIndex } from './runIndex.js';

function createRunManifest(runId: string, success: boolean): RunManifestRecord {
  return {
    schemaVersion: 1,
    run: {
      runId,
      success,
      status: success ? 'success' : 'failure',
      startedAt: '2026-03-23T18:00:00.000Z',
      completedAt: '2026-03-23T18:00:10.000Z',
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
      selectors: ['login.yaml'],
      counts: {
        specs: {
          total: 1,
          passed: success ? 1 : 0,
          failed: success ? 0 : 1,
        },
        steps: {
          total: 1,
          passed: success ? 1 : 0,
          failed: success ? 0 : 1,
        },
      },
      firstFailure: success
        ? undefined
        : {
            specId: 'login',
            specName: 'login',
            message: 'button not found',
            screenshotPath: 'tests/login/screenshots/001.jpg',
          },
    },
    input: {
      environment: {
        envName: 'dev',
        variables: {},
        secretReferences: [],
      },
      specs: [],
      cli: {
        command: 'finalrun test',
        selectors: ['login.yaml'],
        debug: false,
      },
    },
    specs: [],
    paths: {
      html: 'index.html',
      runJson: 'run.json',
      summaryJson: 'summary.json',
      log: 'runner.log',
    },
  };
}

test('rebuildRunIndex writes runs.json and root index.html from run.json files', async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-run-index-'));
  const runId = '2026-03-23T18-00-00.000Z-dev-android';
  const runDir = path.join(artifactsDir, runId);
  await fsp.mkdir(runDir, { recursive: true });
  await fsp.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify(createRunManifest(runId, false), null, 2),
    'utf-8',
  );

  try {
    const index = await rebuildRunIndex(artifactsDir);
    assert.equal(index.runs.length, 1);
    assert.equal(index.runs[0]?.runId, runId);

    const runsJsonPath = path.join(artifactsDir, 'runs.json');
    const indexHtmlPath = path.join(artifactsDir, 'index.html');
    for (const target of [runsJsonPath, indexHtmlPath]) {
      const stats = await fsp.stat(target);
      assert.equal(stats.isFile(), true);
    }

    const html = await fsp.readFile(indexHtmlPath, 'utf-8');
    assert.match(html, /FinalRun Reports/);
    assert.match(html, /button not found/);
  } finally {
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  }
});

test('serveReportArtifacts serves the root report index over HTTP', async () => {
  const artifactsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-report-server-'));
  await fsp.writeFile(
    path.join(artifactsDir, 'index.html'),
    '<html><body>root report</body></html>',
    'utf-8',
  );

  const server = await serveReportArtifacts({
    artifactsDir,
    port: 0,
  });

  try {
    const body = await new Promise<string>((resolve, reject) => {
      get(server.url, (response) => {
        let output = '';
        response.setEncoding('utf-8');
        response.on('data', (chunk) => {
          output += chunk;
        });
        response.on('end', () => resolve(output));
      }).on('error', reject);
    });

    assert.match(body, /root report/);
  } finally {
    await server.close();
    await fsp.rm(artifactsDir, { recursive: true, force: true });
  }
});
