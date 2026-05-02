import * as fs from 'node:fs';
import { openAsBlob } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';
import { Logger } from '@finalrun/common';
import { prepareAppForUpload, type PreparedApp } from './appBundle.js';

// Minimal projection of the CLI's CheckRunnerResult needed by submission.
// Cloud-core does not depend on the CLI's check pipeline; the orchestrator
// (CLI bin) is responsible for producing this shape.
export interface CheckedSpecs {
  tests: Array<{
    sourcePath?: string;
    relativePath?: string;
    name?: string;
  }>;
  suite?: {
    sourcePath?: string;
    relativePath?: string;
    name?: string;
  };
}

export interface SubmitRunInput {
  /** Pre-validated tests + (optional) suite produced by the CLI's checkRunner. */
  checked: CheckedSpecs;
  /** Workspace root containing .finalrun/config.yaml and .finalrun/env/. */
  workspaceRoot: string;
  /** Original positional selectors from the CLI invocation (for display + form data). */
  selectors: string[];
  suitePath?: string;
  envName?: string;
  platform?: string;
  appPath?: string;
  /** Non-secret variables from the env YAML, recorded on the run row.
   *  Secrets are intentionally not forwarded. */
  variables?: Record<string, string>;
  /** Verbatim CLI invocation string for the run record (e.g. "finalrun cloud test ..."). */
  command: string;
  /** Cloud service base URL. */
  cloudUrl: string;
  /** API key sent in the Authorization header. */
  apiKey: string;
}

export interface SubmitRunResult {
  runId: string;
  statusUrl: string;
  appFilename?: string;
}

// Generous timeout to accommodate large APK/IPA uploads on slow uplinks while
// still catching genuinely stalled connections. Override with
// FINALRUN_SUBMIT_TIMEOUT_MS for ultra-large uploads or low-bandwidth tests.
const SUBMIT_TIMEOUT_MS = parseSubmitTimeoutMs(30 * 60 * 1000);

function parseSubmitTimeoutMs(defaultMs: number): number {
  const raw = process.env['FINALRUN_SUBMIT_TIMEOUT_MS'];
  if (raw === undefined || raw === '') return defaultMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid FINALRUN_SUBMIT_TIMEOUT_MS=${JSON.stringify(raw)}: must be a positive integer (milliseconds).`,
    );
  }
  return parsed;
}

export async function submitRun(input: SubmitRunInput): Promise<SubmitRunResult> {
  Logger.i('Preparing cloud run...');

  // Resolve app — either from --app flag or let the server auto-pick
  // the latest app_upload for this org + platform at submit time.
  // Client-side inspection was intentionally removed: the server validates
  // the binary (platform, simulator-compatibility, packageName) authoritatively
  // after upload, and dropping the inspection step keeps the slim binary lean.
  // For .app directories (iOS simulator builds), prepareAppForUpload zips
  // them on the fly into a temp .app.zip; we clean that up in the finally.
  let appMode: { type: 'file'; prepared: PreparedApp } | { type: 'server-default' };

  if (input.appPath) {
    const prepared = prepareAppForUpload(input.appPath);
    appMode = { type: 'file', prepared };
  } else {
    const platformLabel = input.platform?.trim() || 'the run target';
    console.log(`\n  No --app provided; server will use the latest app uploaded for ${platformLabel}.\n`);
    appMode = { type: 'server-default' };
  }

  // Collect resolved file paths
  const filesToZip: Array<{ absolutePath: string; relativePath: string }> = [];

  if (input.checked.suite?.sourcePath && input.checked.suite.relativePath) {
    filesToZip.push({
      absolutePath: input.checked.suite.sourcePath,
      relativePath: path.join('suites', input.checked.suite.relativePath),
    });
  }

  for (const spec of input.checked.tests) {
    if (!spec.sourcePath || !spec.relativePath) continue;
    filesToZip.push({
      absolutePath: spec.sourcePath,
      relativePath: path.join('tests', spec.relativePath),
    });
  }

  const configPath = path.join(input.workspaceRoot, '.finalrun', 'config.yaml');
  if (fs.existsSync(configPath)) {
    filesToZip.push({
      absolutePath: configPath,
      relativePath: 'config.yaml',
    });
  }

  // Ship the env file matching the *resolved* env name the caller computed
  // (--env if passed, else config.yaml's `env:` field, else nothing). The
  // CLI orchestrator passes the resolved value here, not the raw flag, so
  // a workspace with `env: dev` in config.yaml gets env/dev.yaml shipped
  // even when the user didn't repeat --env=dev on the command line.
  // Uploading just the one in-use env file (instead of every YAML under
  // .finalrun/env/) avoids leaking other environments' bindings to the
  // cloud submission.
  if (input.envName) {
    const envDir = path.join(input.workspaceRoot, '.finalrun', 'env');
    const candidates = [`${input.envName}.yaml`, `${input.envName}.yml`];
    for (const candidate of candidates) {
      const envPath = path.join(envDir, candidate);
      if (fs.existsSync(envPath)) {
        filesToZip.push({
          absolutePath: envPath,
          relativePath: path.join('env', candidate),
        });
        break;
      }
    }
  }

  // Create zip with only selected files
  Logger.i(`Zipping ${filesToZip.length} file(s)...`);
  const zip = new AdmZip();
  for (const file of filesToZip) {
    const dir = path.dirname(file.relativePath);
    zip.addLocalFile(file.absolutePath, dir);
  }

  const zipPath = path.join(os.tmpdir(), `finalrun-cloud-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  try {
    // Display name: suite name for suite runs, test name for single-test runs,
    // "<first> + N more" for multi-test runs, null otherwise.
    let runName: string | null = null;
    if (input.suitePath) {
      runName = input.checked.suite?.name ?? path.basename(input.suitePath, path.extname(input.suitePath));
    } else if (input.checked.tests.length === 1) {
      runName = input.checked.tests[0]?.name ?? null;
    } else if (input.checked.tests.length > 1) {
      const first = input.checked.tests[0]?.name ?? path.basename(input.checked.tests[0]?.relativePath ?? '');
      const remaining = input.checked.tests.length - 1;
      runName = `${first} + ${remaining} more`;
    }

    // Run type classification. The server falls back to its own classification
    // if this field is omitted.
    const runType: 'single_test' | 'multi_test' | 'suite' = input.suitePath
      ? 'suite'
      : input.checked.tests.length === 1
        ? 'single_test'
        : 'multi_test';

    const formData = new FormData();
    const zipBuffer = fs.readFileSync(zipPath);
    formData.append('file', new Blob([zipBuffer]), 'specs.zip');
    formData.append('command', input.command);
    formData.append('selectors', JSON.stringify(input.selectors));
    formData.append('runType', runType);
    if (runName) {
      formData.append('name', runName);
    }
    if (input.suitePath) {
      formData.append('suitePath', input.suitePath);
    }
    if (input.envName) {
      formData.append('envName', input.envName);
    }
    if (input.variables && Object.keys(input.variables).length > 0) {
      formData.append('variables', JSON.stringify(input.variables));
    }
    if (input.platform) {
      formData.append('platform', input.platform);
    }

    let spinnerMessage: string;
    const submissionLabel = input.suitePath
      ? `suite ${path.basename(input.suitePath)} (${input.checked.tests.length} test(s))`
      : `${input.checked.tests.length} test(s)`;

    if (appMode.type === 'file') {
      // Stream the file into the multipart body so a large APK/.app.zip isn't
      // pulled into memory just to wrap as a Blob.
      const { uploadPath, filename: appFileName, size: appSize } = appMode.prepared;
      const appBlob = await openAsBlob(uploadPath);
      formData.append('appFile', appBlob, appFileName);
      formData.append('appFilename', appFileName);

      spinnerMessage = `Uploading ${appFileName} (${formatBytes(appSize)}) and submitting ${submissionLabel}...`;
    } else {
      // server-default: no app fields on the request; server picks latest
      spinnerMessage = `Submitting ${submissionLabel} (using latest uploaded app)...`;
    }

    const uploadStart = Date.now();
    const { default: ora } = await import('ora');
    const spinner = ora(spinnerMessage).start();

    const url = `${input.cloudUrl}/api/v1/execute`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}` },
        body: formData,
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
    } catch (e) {
      const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
      const isTimeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      spinner.fail(
        isTimeout
          ? `Upload timed out after ${elapsed}s — connection stalled.`
          : `Upload failed after ${elapsed}s`,
      );
      throw e;
    }

    const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(1);
    if (response.status !== 201) {
      spinner.fail(`Submission failed after ${elapsed}s (HTTP ${response.status})`);
      const body = await response.text();
      throw new Error(`Cloud service returned ${response.status}: ${body}`);
    }

    // Validate response shape before declaring success on the spinner. Wrap
    // the JSON parse so a malformed/empty body (proxy injecting HTML,
    // truncated response) fails the spinner instead of leaving it hung.
    let result: { success: boolean; runId?: string; error?: string };
    try {
      result = await response.json() as typeof result;
    } catch (e) {
      spinner.fail(`Submission succeeded but server returned an unparseable body`);
      throw e;
    }
    if (!result.success || !result.runId) {
      spinner.fail(`Submission rejected by server`);
      throw new Error(
        `Cloud submission failed: ${result.error ?? JSON.stringify(result)}`,
      );
    }

    if (appMode.type === 'file') {
      spinner.succeed(`Uploaded ${formatBytes(appMode.prepared.size)} in ${elapsed}s`);
    } else {
      spinner.succeed(`Submitted in ${elapsed}s`);
    }

    // Fire-and-forget: print the polling URL and return.
    const statusUrl = `${input.cloudUrl}/runs/${result.runId}`;
    console.log(`\n\x1b[32m✓ Run submitted\x1b[0m`);
    console.log(`  Run ID:      ${result.runId}`);
    console.log(`  Status URL:  ${statusUrl}`);
    console.log(`\n  The run is now queued. Use the status URL above to track progress.`);

    let appFilename: string | undefined;
    if (appMode.type === 'file') {
      appFilename = appMode.prepared.filename;
      console.log(`\n  \x1b[33mTip:\x1b[0m You don't need to upload the app every time. Without --app,`);
      console.log(`       FinalRun uses your latest uploaded app (${appFilename}).`);
    }

    return { runId: result.runId, statusUrl, appFilename };
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore cleanup errors
    }
    if (appMode.type === 'file' && appMode.prepared.isTempZip) {
      try {
        fs.unlinkSync(appMode.prepared.uploadPath);
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
