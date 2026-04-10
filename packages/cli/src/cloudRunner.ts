import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { Logger } from '@finalrun/common';
import { runCheck } from './checkRunner.js';

const FINALRUN_CLOUD_URL = process.env['FINALRUN_CLOUD_URL'] || 'https://cloud.finalrun.io';

export interface CloudRunnerOptions {
  selectors: string[];
  suitePath?: string;
  envName?: string;
  platform?: string;
  appPath?: string;
}

export async function runCloud(options: CloudRunnerOptions): Promise<void> {
  Logger.i('Preparing cloud run...');

  // 1. Validate specs locally (fast fail before upload)
  const checked = await runCheck({
    selectors: options.selectors,
    suitePath: options.suitePath,
    envName: options.envName,
    platform: options.platform,
    requireSelection: true,
  });

  // 2. Collect resolved file paths
  const filesToZip: Array<{ absolutePath: string; relativePath: string }> = [];

  // Add suite file if present
  if (checked.suite?.sourcePath && checked.suite.relativePath) {
    filesToZip.push({
      absolutePath: checked.suite.sourcePath,
      relativePath: path.join('suites', checked.suite.relativePath),
    });
  }

  // Add test files
  for (const spec of checked.tests) {
    if (!spec.sourcePath || !spec.relativePath) continue;
    filesToZip.push({
      absolutePath: spec.sourcePath,
      relativePath: path.join('tests', spec.relativePath),
    });
  }

  // Add config.yaml if present
  const configPath = path.join(process.cwd(), '.finalrun', 'config.yaml');
  if (fs.existsSync(configPath)) {
    filesToZip.push({
      absolutePath: configPath,
      relativePath: 'config.yaml',
    });
  }

  // Add env files if present
  const envDir = path.join(process.cwd(), '.finalrun', 'env');
  if (fs.existsSync(envDir)) {
    const envFiles = fs.readdirSync(envDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    for (const envFile of envFiles) {
      filesToZip.push({
        absolutePath: path.join(envDir, envFile),
        relativePath: path.join('env', envFile),
      });
    }
  }

  // 3. Create zip with only selected files
  Logger.i(`Zipping ${filesToZip.length} file(s)...`);
  const zip = new AdmZip();
  for (const file of filesToZip) {
    const dir = path.dirname(file.relativePath);
    zip.addLocalFile(file.absolutePath, dir);
  }

  const zipPath = path.join(os.tmpdir(), `finalrun-cloud-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  try {
    // 4. Upload to cloud service
    const command = `finalrun cloud ${options.selectors.join(' ')}`;
    Logger.i(`Submitting ${checked.tests.length} test(s) to cloud...`);

    const formData = new FormData();
    const zipBuffer = fs.readFileSync(zipPath);
    formData.append('file', new Blob([zipBuffer]), 'specs.zip');
    formData.append('command', command);
    formData.append('selectors', JSON.stringify(options.selectors));
    if (options.suitePath) {
      formData.append('suitePath', options.suitePath);
    }
    if (options.envName) {
      formData.append('envName', options.envName);
    }
    if (options.platform) {
      formData.append('platform', options.platform);
    }
    if (options.appPath) {
      const appBuffer = fs.readFileSync(options.appPath);
      const appFileName = path.basename(options.appPath);
      formData.append('appFile', new Blob([appBuffer]), appFileName);
      Logger.i(`Uploading app: ${appFileName}`);
    }

    const url = `${FINALRUN_CLOUD_URL}/api/v1/execute`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }

    const result = (await response.json()) as { success: boolean; runId?: string; error?: string };
    if (!result.success || !result.runId) {
      console.log(`\n\x1b[31m✖ Cloud submission failed\x1b[0m`);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    Logger.i(`Run submitted: ${result.runId}`);
    Logger.i(`Polling status...\n`);
    await pollRunUntilFinished(result.runId);
  } finally {
    // Clean up temp zip
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

interface RunDetailsResponse {
  success: boolean;
  run?: {
    id: string;
    status: string;
    totalTests: number;
    completedTests: number;
  };
  nodes?: Array<{
    id: string;
    type: string;
    name: string;
    status: string;
    errorMessage?: string | null;
    videoUrl?: string | null;
  }>;
}

async function pollRunUntilFinished(runId: string): Promise<void> {
  const url = `${FINALRUN_CLOUD_URL}/api/v1/runs/${runId}`;
  const POLL_INTERVAL_MS = 5_000;
  const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutes
  const start = Date.now();
  let lastStatus = '';
  const seenNodeStatus = new Map<string, string>();

  while (Date.now() - start < MAX_WAIT_MS) {
    let body: RunDetailsResponse;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        Logger.w(`poll HTTP ${res.status}, retrying...`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      body = (await res.json()) as RunDetailsResponse;
    } catch (e) {
      Logger.w(`poll failed: ${e instanceof Error ? e.message : String(e)}`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!body.success || !body.run) {
      Logger.w(`run not found, retrying...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const { run, nodes = [] } = body;

    if (run.status !== lastStatus) {
      Logger.i(`run status: ${run.status} (${run.completedTests}/${run.totalTests} tests)`);
      lastStatus = run.status;
    }

    // Print transitions for each test node
    for (const node of nodes) {
      if (node.type !== 'test') continue;
      const previous = seenNodeStatus.get(node.id);
      if (previous !== node.status) {
        const icon = statusIcon(node.status);
        const suffix = node.errorMessage ? ` — ${node.errorMessage}` : '';
        Logger.i(`  ${icon} ${node.name}: ${node.status}${suffix}`);
        seenNodeStatus.set(node.id, node.status);
      }
    }

    if (run.status === 'completed' || run.status === 'failed' || run.status === 'aborted') {
      const passed = nodes.filter((n) => n.type === 'test' && n.status === 'completed').length;
      const total = nodes.filter((n) => n.type === 'test').length;
      const colour = run.status === 'completed' ? '\x1b[32m' : '\x1b[31m';
      console.log(`\n${colour}Run ${run.status}: ${passed}/${total} passed\x1b[0m`);
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  Logger.w(`run did not finish within ${MAX_WAIT_MS / 1000}s — check the cloud server`);
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✔';
    case 'failed': return '✖';
    case 'running': return '◉';
    case 'queued': return '○';
    default: return '·';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
