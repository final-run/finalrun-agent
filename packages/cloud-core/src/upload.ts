import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectApp, formatAppInfo, type AppMetadata } from './appInspector.js';
import { formatBytes } from './submit.js';

export interface UploadAppInput {
  appPath: string;
  cloudUrl: string;
  apiKey: string;
}

export interface UploadAppResult {
  appUploadId: string;
  filename: string;
  size: number;
}

export async function uploadApp(input: UploadAppInput): Promise<UploadAppResult> {
  if (!fs.existsSync(input.appPath)) {
    throw new Error(`App file not found: ${input.appPath}`);
  }

  // 1. Inspect and print info before uploading
  let metadata: AppMetadata;
  try {
    metadata = await inspectApp(input.appPath);
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

  const appBuffer = fs.readFileSync(input.appPath);
  const appFileName = path.basename(input.appPath);
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
    response = await fetch(`${input.cloudUrl}/api/v1/app_uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}` },
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

  return {
    appUploadId: result.appUpload.id,
    filename: appFileName,
    size: appSize,
  };
}
