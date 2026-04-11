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
  appPath: string;
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
    // Capture the raw CLI invocation, exactly as the user typed it (minus the
    // node binary path). process.argv = [node, finalrun(.ts), ...userArgs].
    const command = `finalrun ${process.argv.slice(2).join(' ')}`;

    // Display name: suite name for suite runs, test name for single-test runs,
    // "<first> + N more" for multi-test runs, null otherwise.
    let runName: string | null = null;
    if (options.suitePath) {
      runName = checked.suite?.name ?? path.basename(options.suitePath, path.extname(options.suitePath));
    } else if (checked.tests.length === 1) {
      runName = checked.tests[0]?.name ?? null;
    } else if (checked.tests.length > 1) {
      const first = checked.tests[0]?.name ?? path.basename(checked.tests[0]?.relativePath ?? '');
      const remaining = checked.tests.length - 1;
      runName = `${first} + ${remaining} more`;
    }

    // Run type classification — based on user intent (selectors), not the
    // expansion result. The server falls back to its own classification if
    // this field is omitted.
    const runType: 'folder' | 'single_test' | 'multi_test' | 'suite' = options.suitePath
      ? 'suite'
      : options.selectors.length === 0
        ? 'folder'
        : options.selectors.length === 1
          ? checked.tests.length === 1 ? 'single_test' : 'folder'
          : 'multi_test';

    const formData = new FormData();
    const zipBuffer = fs.readFileSync(zipPath);
    formData.append('file', new Blob([zipBuffer]), 'specs.zip');
    formData.append('command', command);
    formData.append('selectors', JSON.stringify(options.selectors));
    formData.append('runType', runType);
    if (runName) {
      formData.append('name', runName);
    }
    if (options.suitePath) {
      formData.append('suitePath', options.suitePath);
    }
    if (options.envName) {
      formData.append('envName', options.envName);
    }
    if (options.platform) {
      formData.append('platform', options.platform);
    }

    const appBuffer = fs.readFileSync(options.appPath);
    const appFileName = path.basename(options.appPath);
    const appSize = appBuffer.byteLength;
    formData.append('appFile', new Blob([appBuffer]), appFileName);
    formData.append('appFilename', appFileName);

    const submissionLabel = options.suitePath
      ? `suite ${path.basename(options.suitePath)} (${checked.tests.length} test(s))`
      : `${checked.tests.length} test(s)`;
    const uploadStart = Date.now();
    const { default: ora } = await import('ora');
    const spinner = ora(
      `Uploading ${appFileName} (${formatBytes(appSize)}) and submitting ${submissionLabel}...`,
    ).start();

    const url = `${FINALRUN_CLOUD_URL}/api/v1/execute`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
    } catch (e) {
      const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
      spinner.fail(`Upload failed after ${elapsed}s`);
      throw e;
    }

    const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
    if (!response.ok) {
      spinner.fail(`Upload failed after ${elapsed}s (HTTP ${response.status})`);
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }
    spinner.succeed(`Uploaded ${formatBytes(appSize)} in ${elapsed}s`);

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
