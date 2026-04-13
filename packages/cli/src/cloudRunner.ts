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

    // Run type classification. The server falls back to its own classification
    // if this field is omitted.
    const runType: 'single_test' | 'multi_test' | 'suite' = options.suitePath
      ? 'suite'
      : checked.tests.length === 1
        ? 'single_test'
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
    // The server returns 201 Created on successful submission. Anything else
    // is an error — surface the body and exit non-zero.
    if (response.status !== 201) {
      spinner.fail(`Upload failed after ${elapsed}s (HTTP ${response.status})`);
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }
    spinner.succeed(`Uploaded ${formatBytes(appSize)} in ${elapsed}s`);

    const result = (await response.json()) as { success: boolean; runId?: string; error?: string };
    if (!result.success || !result.runId) {
      throw new Error(
        `Cloud submission failed: ${result.error ?? JSON.stringify(result)}`,
      );
    }

    // Fire-and-forget: the run is now queued. Print the polling URL and exit.
    // The user can curl the status URL to track progress; the CLI does not
    // wait for the run to finish.
    console.log(`\n\x1b[32m✓ Run submitted\x1b[0m`);
    console.log(`  Run ID:      ${result.runId}`);
    console.log(`  Status URL:  ${FINALRUN_CLOUD_URL}/api/v1/runs/${result.runId}`);
    console.log(`\n  The run is now queued. Use the status URL above to track progress.`);
  } finally {
    // Clean up temp zip
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
