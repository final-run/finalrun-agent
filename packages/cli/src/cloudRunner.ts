// Thin CLI orchestrator: runs the local check pipeline, then delegates to
// @finalrun/cloud-core for the actual zip + HTTP submission. The pure submit
// and upload logic lives in cloud-core so the slim cloud-only binary can use
// it without pulling the local-runtime dependency graph.

import { runCheck } from './checkRunner.js';
import {
  submitRun,
  uploadApp as uploadAppCore,
  type SubmitRunResult,
  type UploadAppResult,
} from '@finalrun/cloud-core';

const FINALRUN_CLOUD_URL = process.env['FINALRUN_CLOUD_URL'] || 'https://cloud-dev.finalrun.app';
const FINALRUN_API_KEY = process.env['FINALRUN_API_KEY'] || '';

function requireApiKey(): string {
  if (!FINALRUN_API_KEY) {
    throw new Error(
      'FINALRUN_API_KEY is not set. Get your API key from the FinalRun Cloud dashboard and set it:\n' +
      '  export FINALRUN_API_KEY=fr_your_key_here',
    );
  }
  return FINALRUN_API_KEY;
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

  // 1. Validate specs locally (fast fail before upload)
  const checked = await runCheck({
    selectors: options.selectors,
    suitePath: options.suitePath,
    envName: options.envName,
    platform: options.platform,
    requireSelection: true,
  });

  // 2. Capture the raw CLI invocation, exactly as the user typed it (minus the
  //    node binary path). process.argv = [node, finalrun(.ts), ...userArgs].
  const command = `finalrun ${process.argv.slice(2).join(' ')}`;

  // 3. Delegate to cloud-core for zip + submit
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
    envName: options.envName,
    platform: options.platform,
    appPath: options.appPath,
    command,
    cloudUrl: FINALRUN_CLOUD_URL,
    apiKey,
  });
}

export async function uploadApp(appPath: string): Promise<UploadAppResult> {
  const apiKey = requireApiKey();
  return uploadAppCore({
    appPath,
    cloudUrl: FINALRUN_CLOUD_URL,
    apiKey,
  });
}
