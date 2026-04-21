import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { Logger } from '@finalrun/common';
import { runCheck } from './checkRunner.js';
import { inspectApp, formatAppInfo, type AppMetadata } from './appInspector.js';

const FINALRUN_CLOUD_URL = process.env['FINALRUN_CLOUD_URL'] || 'https://cloud.finalrun.io';
const FINALRUN_API_KEY = process.env['FINALRUN_API_KEY'] || '';

function getAuthHeaders(): Record<string, string> {
  if (!FINALRUN_API_KEY) {
    throw new Error(
      'FINALRUN_API_KEY is not set. Get your API key from the FinalRun Cloud dashboard and set it:\n' +
      '  export FINALRUN_API_KEY=fr_your_key_here',
    );
  }
  return { Authorization: `Bearer ${FINALRUN_API_KEY}` };
}

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

  // 2. Resolve app — either from --app flag or let the server auto-pick
  //    the latest app_upload for this org + platform at submit time.
  let appMode: { type: 'file'; path: string } | { type: 'server-default' };

  let inlineMetadata: AppMetadata | undefined;
  if (options.appPath) {
    if (!fs.existsSync(options.appPath)) {
      throw new Error(`App file not found: ${options.appPath}`);
    }

    // Inspect inline app and print info before submitting
    try {
      inlineMetadata = await inspectApp(options.appPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`\n\x1b[31mx ${msg}\x1b[0m\n`);
    }

    if (inlineMetadata.platform === 'ios' && inlineMetadata.simulatorCompatible === false) {
      throw new Error(
        `\n\x1b[31mx This iOS app is a device-only build and cannot run on simulators.\x1b[0m\n` +
        `   Rebuild with the iphonesimulator SDK:\n` +
        `     • Flutter:  flutter build ios --simulator --debug\n` +
        `     • Xcode:    xcodebuild -sdk iphonesimulator ...\n`,
      );
    }

    console.log('');
    console.log(formatAppInfo(inlineMetadata));
    console.log('');

    appMode = { type: 'file', path: options.appPath };
  } else {
    console.log(`\n  No --app provided; server will use the latest app uploaded for platform '${options.platform}'.\n`);
    appMode = { type: 'server-default' };
  }

  // 3. Collect resolved file paths
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

  // 4. Create zip with only selected files
  Logger.i(`Zipping ${filesToZip.length} file(s)...`);
  const zip = new AdmZip();
  for (const file of filesToZip) {
    const dir = path.dirname(file.relativePath);
    zip.addLocalFile(file.absolutePath, dir);
  }

  const zipPath = path.join(os.tmpdir(), `finalrun-cloud-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  try {
    // 5. Upload to cloud service
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

    // Attach app binary only when --app was passed. Otherwise the server
    // resolves the latest app_upload for this org + platform at submit time.
    let spinnerMessage: string;
    const submissionLabel = options.suitePath
      ? `suite ${path.basename(options.suitePath)} (${checked.tests.length} test(s))`
      : `${checked.tests.length} test(s)`;

    if (appMode.type === 'file') {
      const appBuffer = fs.readFileSync(appMode.path);
      const appFileName = path.basename(appMode.path);
      const appSize = appBuffer.byteLength;
      formData.append('appFile', new Blob([appBuffer]), appFileName);
      formData.append('appFilename', appFileName);

      // Include inspected metadata as a hint — server re-validates authoritatively.
      // Don't append `platform` here: the --platform flag is already sent above,
      // and multer would combine duplicates into an array breaking downstream .trim().
      if (inlineMetadata) {
        formData.append('packageName', inlineMetadata.packageName);
      }

      spinnerMessage = `Uploading ${appFileName} (${formatBytes(appSize)}) and submitting ${submissionLabel}...`;
    } else {
      // server-default: no app fields on the request; server picks latest
      spinnerMessage = `Submitting ${submissionLabel} (using latest uploaded app)...`;
    }

    const uploadStart = Date.now();
    const { default: ora } = await import('ora');
    const spinner = ora(spinnerMessage).start();

    const url = `${FINALRUN_CLOUD_URL}/api/v1/execute`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: getAuthHeaders(),
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
      spinner.fail(`Submission failed after ${elapsed}s (HTTP ${response.status})`);
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }

    if (appMode.type === 'file') {
      const appSize = fs.statSync(appMode.path).size;
      spinner.succeed(`Uploaded ${formatBytes(appSize)} in ${elapsed}s`);
    } else {
      spinner.succeed(`Submitted in ${elapsed}s`);
    }

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
    console.log(`  Status URL:  ${FINALRUN_CLOUD_URL}/runs/${result.runId}`);
    console.log(`\n  The run is now queued. Use the status URL above to track progress.`);

    if (appMode.type === 'file') {
      const appFileName = path.basename(appMode.path);
      console.log(`\n  \x1b[33mTip:\x1b[0m You don't need to upload the app every time. Without --app,`);
      console.log(`       FinalRun uses your latest uploaded app (${appFileName}).`);
    }
  } finally {
    // Clean up temp zip
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function uploadApp(appPath: string): Promise<void> {
  if (!fs.existsSync(appPath)) {
    throw new Error(`App file not found: ${appPath}`);
  }

  // 1. Inspect and print info before uploading
  let metadata: AppMetadata;
  try {
    metadata = await inspectApp(appPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`\n\x1b[31mx ${msg}\x1b[0m\n`);
  }

  if (metadata.platform === 'ios' && metadata.simulatorCompatible === false) {
    throw new Error(
      `\n\x1b[31mx This iOS app is a device-only build and cannot run on simulators.\x1b[0m\n` +
      `   Rebuild with the iphonesimulator SDK:\n` +
      `     • Flutter:  flutter build ios --simulator --debug\n` +
      `     • Xcode:    xcodebuild -sdk iphonesimulator ...\n`,
    );
  }

  console.log('');
  console.log(formatAppInfo(metadata));
  console.log('');

  const appBuffer = fs.readFileSync(appPath);
  const appFileName = path.basename(appPath);
  const appSize = appBuffer.byteLength;

  const { default: ora } = await import('ora');
  const spinner = ora(`Uploading ${appFileName} (${formatBytes(appSize)})...`).start();
  const uploadStart = Date.now();

  // 2. Build form data with metadata hints — server will re-validate
  const formData = new FormData();
  formData.append('appFile', new Blob([appBuffer]), appFileName);
  formData.append('platform', metadata.platform);
  formData.append('packageName', metadata.packageName);

  let response: Response;
  try {
    response = await fetch(`${FINALRUN_CLOUD_URL}/api/v1/app_uploads`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: formData,
    });
  } catch (e) {
    const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
    spinner.fail(`Upload failed after ${elapsed}s`);
    throw e;
  }

  const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
  if (response.status !== 201) {
    spinner.fail(`Upload failed after ${elapsed}s (HTTP ${response.status})`);
    const body = await response.text();
    throw new Error(`Cloud service returned ${response.status}: ${body}`);
  }

  spinner.succeed(`Uploaded ${appFileName} (${formatBytes(appSize)}) in ${elapsed}s`);

  const result = (await response.json()) as { success: boolean; appUpload?: { id: string }; error?: string };
  if (!result.success || !result.appUpload) {
    throw new Error(`Upload failed: ${result.error ?? JSON.stringify(result)}`);
  }

  console.log(`\n  \x1b[32m✓ App uploaded\x1b[0m`);
  console.log(`  App ID:    ${result.appUpload.id}`);
  console.log(`  Filename:  ${appFileName}`);
  console.log(`\n  This app will be used automatically when you run tests without --app.`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
