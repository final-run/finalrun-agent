// Thin CLI orchestrator: runs the local check pipeline, then delegates to
// @finalrun/cloud-core for the actual zip + HTTP submission. The pure submit
// and upload logic lives in cloud-core so the slim cloud-only binary can use
// it without pulling the local-runtime dependency graph.

import { runCheck } from '@finalrun/common';
import {
  submitRun,
  uploadApp as uploadAppCore,
  type SubmitRunResult,
  type UploadAppResult,
} from '@finalrun/cloud-core';

const DEFAULT_CLOUD_URL = 'https://cloud.finalrun.app';

function resolveCloudUrl(): string {
  const override = process.env['FINALRUN_CLOUD_URL'];
  return override && override.trim() ? override.trim() : DEFAULT_CLOUD_URL;
}

function requireApiKey(): string {
  const key = process.env['FINALRUN_API_KEY'] ?? '';
  if (!key) {
    throw new Error(
      'FINALRUN_API_KEY is not set. Get your API key from the FinalRun Cloud dashboard and set it:\n' +
      '  export FINALRUN_API_KEY=fr_your_key_here',
    );
  }
  return key;
}

export interface CloudRunnerOptions {
  selectors: string[];
  suitePath?: string;
  envName?: string;
  platform?: string;
  appPath?: string;
}

export async function runCloud(options: CloudRunnerOptions): Promise<SubmitRunResult> {
  const apiKey = requireApiKey();
  const cloudUrl = resolveCloudUrl();

  // 1. Validate specs locally (fast fail before upload). runCheck resolves
  //    the effective env from --env if passed, else from .finalrun/config.yaml's
  //    `env:` field — same logic the server-side runCheck will run when it
  //    unpacks the zip.
  const checked = await runCheck({
    selectors: options.selectors,
    suitePath: options.suitePath,
    envName: options.envName,
    platform: options.platform,
    requireSelection: true,
  });

  // 2. Capture the CLI invocation for the run record. shell-quote each user
  //    arg so something like `--name "My Test"` round-trips correctly when an
  //    operator copy-pastes the recorded command. process.argv =
  //    [node, finalrun(.ts), ...userArgs].
  const command = ['finalrun', ...process.argv.slice(2).map(shellQuote)].join(' ');

  // 3. Pass the *resolved* env name (not the raw --env flag) to submit so the
  //    zip includes the right env file. If config.yaml declares `env: dev`,
  //    the resolution above already promoted that to checked.environment.envName
  //    even when --env wasn't passed; the previous behavior of forwarding the
  //    raw flag value left config-default users with no env file in the zip
  //    and a 500 from the server.
  const effectiveEnvName = checked.environment.envPath
    ? checked.environment.envName
    : undefined;

  // 4. Delegate to cloud-core for zip + submit
  return submitRun({
    checked: {
      tests: checked.tests.map((spec) => ({
        sourcePath: spec.sourcePath,
        relativePath: spec.relativePath,
        name: spec.name,
      })),
      suite: checked.suite
        ? {
            sourcePath: checked.suite.sourcePath,
            relativePath: checked.suite.relativePath,
            name: checked.suite.name,
          }
        : undefined,
    },
    workspaceRoot: checked.workspace.rootDir,
    selectors: options.selectors,
    suitePath: options.suitePath,
    envName: effectiveEnvName,
    platform: options.platform,
    appPath: options.appPath,
    command,
    cloudUrl,
    apiKey,
  });
}

// POSIX shell single-quote escaping. Wraps the value in single quotes and
// escapes any embedded single quote as `'\''` (close-quote, escaped quote,
// reopen-quote). Returns the value bare when it's safe (alphanum + a few
// punctuation chars) so common args stay readable.
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./@%+,:=-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export async function uploadApp(appPath: string): Promise<UploadAppResult> {
  const apiKey = requireApiKey();
  return uploadAppCore({
    appPath,
    cloudUrl: resolveCloudUrl(),
    apiKey,
  });
}
