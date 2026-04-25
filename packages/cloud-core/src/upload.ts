import * as fs from 'node:fs';
import * as path from 'node:path';
import { formatBytes } from './submit.js';

export interface UploadAppInput {
  appPath: string;
  cloudUrl: string;
  apiKey: string;
  /** Optional explicit platform; if omitted, inferred from filename extension. */
  platform?: 'android' | 'ios';
}

export interface UploadAppResult {
  appUploadId: string;
  filename: string;
  size: number;
}

function inferPlatformFromFilename(appPath: string): 'android' | 'ios' {
  const lower = appPath.toLowerCase();
  if (lower.endsWith('.apk')) return 'android';
  if (lower.endsWith('.ipa') || lower.endsWith('.app.zip') || lower.endsWith('.zip')) return 'ios';
  throw new Error(
    `Cannot infer platform from filename: ${appPath}. ` +
    `Expected .apk for Android or .ipa/.zip for iOS, or pass --platform.`,
  );
}

export async function uploadApp(input: UploadAppInput): Promise<UploadAppResult> {
  if (!fs.existsSync(input.appPath)) {
    throw new Error(`App file not found: ${input.appPath}`);
  }

  // Server validates the binary authoritatively after upload (platform,
  // simulator-compatibility, packageName). We only send a platform hint
  // — inferred from extension if not provided.
  const platform = input.platform ?? inferPlatformFromFilename(input.appPath);

  const appBuffer = fs.readFileSync(input.appPath);
  const appFileName = path.basename(input.appPath);
  const appSize = appBuffer.byteLength;

  const { default: ora } = await import('ora');
  const spinner = ora(`Uploading ${appFileName} (${formatBytes(appSize)})...`).start();
  const uploadStart = Date.now();

  const formData = new FormData();
  formData.append('appFile', new Blob([appBuffer]), appFileName);
  formData.append('platform', platform);

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
