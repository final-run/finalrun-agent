import * as fs from 'node:fs';
import { openAsBlob } from 'node:fs';
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

// Generous timeout to accommodate large APK/IPA uploads on slow uplinks while
// still catching genuinely stalled connections. Override with
// FINALRUN_UPLOAD_TIMEOUT_MS for ultra-large uploads or low-bandwidth tests.
const UPLOAD_TIMEOUT_MS = parseTimeoutMs('FINALRUN_UPLOAD_TIMEOUT_MS', 30 * 60 * 1000);

function parseTimeoutMs(envVar: string, defaultMs: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return defaultMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${envVar}=${JSON.stringify(raw)}: must be a positive integer (milliseconds).`,
    );
  }
  return parsed;
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

  const appFileName = path.basename(input.appPath);
  const appSize = fs.statSync(input.appPath).size;

  const { default: ora } = await import('ora');
  const spinner = ora(`Uploading ${appFileName} (${formatBytes(appSize)})...`).start();
  const uploadStart = Date.now();

  // Stream the file via openAsBlob (Node ≥20.16 / Bun) so a large APK/IPA
  // doesn't get loaded into a single Buffer just to wrap as a Blob.
  const appBlob = await openAsBlob(input.appPath);

  const formData = new FormData();
  formData.append('appFile', appBlob, appFileName);
  formData.append('platform', platform);

  let response: Response;
  try {
    response = await fetch(`${input.cloudUrl}/api/v1/app_uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
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
    spinner.fail(`Upload failed after ${elapsed}s (HTTP ${response.status})`);
    const body = await response.text();
    throw new Error(`Cloud service returned ${response.status}: ${body}`);
  }

  // Validate response shape before declaring success on the spinner. Wrap the
  // JSON parse so a malformed/empty body (proxy injecting HTML, truncated
  // response) fails the spinner instead of leaving it hung.
  let result: { success: boolean; appUpload?: { id: string }; error?: string };
  try {
    result = await response.json() as typeof result;
  } catch (e) {
    spinner.fail(`Upload succeeded but server returned an unparseable body`);
    throw e;
  }
  if (!result.success || !result.appUpload) {
    spinner.fail(`Upload rejected by server`);
    throw new Error(`Upload failed: ${result.error ?? JSON.stringify(result)}`);
  }

  spinner.succeed(`Uploaded ${appFileName} (${formatBytes(appSize)}) in ${elapsed}s`);

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
