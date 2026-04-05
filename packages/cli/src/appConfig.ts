import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  PLATFORM_ANDROID,
  PLATFORM_IOS,
  PLATFORM_WEB,
  type AppConfig,
  type WebConfig,
} from '@finalrun/common';

const execFileAsync = promisify(execFile);
const APP_TOP_LEVEL_KEYS = new Set(['name', 'packageName', 'bundleId']);
const WEB_TOP_LEVEL_KEYS = new Set(['baseUrl', 'browser', 'viewport']);
const WEB_VIEWPORT_TOP_LEVEL_KEYS = new Set(['width', 'height']);

type SupportedPlatform =
  | typeof PLATFORM_ANDROID
  | typeof PLATFORM_IOS
  | typeof PLATFORM_WEB;

export interface ResolvedAppConfig {
  platform: SupportedPlatform;
  identifier: string;
  identifierKind: 'packageName' | 'bundleId' | 'url';
  name?: string;
  sourceEnvName?: string;
  browser?: 'chromium' | 'firefox' | 'webkit';
  viewport?: { width: number; height: number };
}

export interface ValidatedAppOverrideLike {
  appPath: string;
  inferredPlatform: string;
  resolvedIdentifier?: string;
}

export function readAppConfig(
  value: unknown,
  label: string,
): AppConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  assertPlainObject(value, label);
  if (value['android'] !== undefined || value['ios'] !== undefined) {
    throw new Error(
      `${label} uses an unsupported nested format. Use app.name, app.packageName, and app.bundleId.`,
    );
  }
  assertAllowedKeys(value, APP_TOP_LEVEL_KEYS, label);

  const app = {
    name: readOptionalTrimmedString(value['name'], `${label} name`),
    packageName: readOptionalTrimmedString(value['packageName'], `${label} packageName`),
    bundleId: readOptionalTrimmedString(value['bundleId'], `${label} bundleId`),
  };

  if (!app.packageName && !app.bundleId) {
    throw new Error(`${label} must define at least one of packageName or bundleId.`);
  }

  return app;
}

export function readWebConfig(
  value: unknown,
  label: string,
): WebConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  assertPlainObject(value, label);
  assertAllowedKeys(value, WEB_TOP_LEVEL_KEYS, label);

  const baseUrl = readRequiredTrimmedString(value['baseUrl'], `${label} baseUrl`);
  assertValidUrl(baseUrl, `${label} baseUrl`);

  return {
    baseUrl,
    browser: readOptionalBrowser(value['browser'], `${label} browser`),
    viewport: readOptionalViewport(value['viewport'], `${label} viewport`),
  };
}

export function resolveAppConfig(params: {
  workspaceApp: AppConfig | undefined;
  workspaceWeb?: WebConfig;
  environmentApp?: AppConfig;
  environmentWeb?: WebConfig;
  envName: string;
  requestedPlatform?: string;
  appOverride?: ValidatedAppOverrideLike;
}): ResolvedAppConfig {
  const workspaceApp = params.workspaceApp;
  const workspaceWeb = params.workspaceWeb;
  if (!workspaceApp?.packageName && !workspaceApp?.bundleId && !workspaceWeb?.baseUrl) {
    throw new Error(
      '.finalrun/config.yaml must define app.packageName, app.bundleId, and/or web.baseUrl. Target config is required for FinalRun runs.',
    );
  }

  const effectiveApp = params.environmentApp ?? workspaceApp;
  const effectiveWeb = params.environmentWeb ?? workspaceWeb;

  const platform = resolveSelectedPlatform({
    requestedPlatform: params.requestedPlatform,
    inferredPlatform: params.appOverride?.inferredPlatform,
    app: effectiveApp,
    web: effectiveWeb,
  });

  if (platform === PLATFORM_ANDROID) {
    if (!effectiveApp?.packageName) {
      throw new Error(
        'No app config found for platform "android". Add app.packageName to .finalrun/config.yaml or choose a different --platform.',
      );
    }
    const resolved = {
      platform,
      identifier: effectiveApp.packageName,
      identifierKind: 'packageName' as const,
      name: effectiveApp?.name,
      sourceEnvName: params.environmentApp ? params.envName : undefined,
    };
    validateResolvedOverrideMatch(params.appOverride, resolved);
    return resolved;
  }

  if (platform === PLATFORM_WEB) {
    if (!effectiveWeb?.baseUrl) {
      throw new Error(
        'No web config found for platform "web". Add web.baseUrl to .finalrun/config.yaml or choose a different --platform.',
      );
    }
    const resolved = {
      platform,
      identifier: effectiveWeb.baseUrl,
      identifierKind: 'url' as const,
      name: effectiveApp?.name,
      sourceEnvName:
        params.environmentApp || params.environmentWeb ? params.envName : undefined,
      browser: effectiveWeb.browser,
      viewport: effectiveWeb.viewport,
    };
    validateResolvedOverrideMatch(params.appOverride, resolved);
    return resolved;
  }

  if (!effectiveApp?.bundleId) {
    throw new Error(
      'No app config found for platform "ios". Add app.bundleId to .finalrun/config.yaml or choose a different --platform.',
    );
  }
  const resolved = {
    platform,
    identifier: effectiveApp.bundleId,
    identifierKind: 'bundleId' as const,
    name: effectiveApp?.name,
    sourceEnvName: params.environmentApp ? params.envName : undefined,
  };
  validateResolvedOverrideMatch(params.appOverride, resolved);
  return resolved;
}

export function formatResolvedAppSummary(app: ResolvedAppConfig): string {
  if (app.platform === PLATFORM_ANDROID) {
    return `Using Android package: ${app.identifier}`;
  }
  if (app.platform === PLATFORM_IOS) {
    return `Using iOS bundle ID: ${app.identifier}`;
  }
  const browserSuffix = app.browser ? ` in ${app.browser}` : '';
  return `Using web target: ${app.identifier}${browserSuffix}`;
}

export async function resolveAppOverrideIdentifier(
  appOverride: ValidatedAppOverrideLike,
): Promise<string> {
  const platform = normalizePlatform(appOverride.inferredPlatform, 'App override platform');
  if (platform === PLATFORM_ANDROID) {
    return await resolveAndroidPackageName(appOverride.appPath);
  }
  return await resolveIOSBundleId(appOverride.appPath);
}

function resolveSelectedPlatform(params: {
  requestedPlatform?: string;
  inferredPlatform?: string;
  app: AppConfig | undefined;
  web?: WebConfig;
}): SupportedPlatform {
  const requestedPlatform = normalizePlatform(
    params.requestedPlatform,
    '--platform',
    { allowUndefined: true },
  );
  const inferredPlatform = normalizePlatform(
    params.inferredPlatform,
    'App override platform',
    { allowUndefined: true },
  );

  if (
    requestedPlatform &&
    inferredPlatform &&
    requestedPlatform !== inferredPlatform
  ) {
    throw new Error(
      formatOverridePlatformMismatch(inferredPlatform, requestedPlatform),
    );
  }

  if (requestedPlatform) {
    return requestedPlatform;
  }

  if (inferredPlatform) {
    return inferredPlatform;
  }

  const configuredPlatforms = [
    params.app?.packageName ? PLATFORM_ANDROID : null,
    params.app?.bundleId ? PLATFORM_IOS : null,
    params.web?.baseUrl ? PLATFORM_WEB : null,
  ].filter((platform): platform is SupportedPlatform => platform !== null);

  if (configuredPlatforms.length === 1) {
    return configuredPlatforms[0]!;
  }

  throw new Error(
    'Multiple targets are configured. Pass --platform android, --platform ios, or --platform web.',
  );
}

function validateResolvedOverrideMatch(
  appOverride: ValidatedAppOverrideLike | undefined,
  resolvedApp: ResolvedAppConfig,
): void {
  if (!appOverride) {
    return;
  }

  const overridePlatform = normalizePlatform(
    appOverride.inferredPlatform,
    'App override platform',
  )!;
  if (overridePlatform !== resolvedApp.platform) {
    throw new Error(
      formatOverridePlatformMismatch(overridePlatform, resolvedApp.platform),
    );
  }

  if (!appOverride.resolvedIdentifier) {
    return;
  }

  if (appOverride.resolvedIdentifier === resolvedApp.identifier) {
    return;
  }

  if (resolvedApp.platform === PLATFORM_ANDROID) {
    throw new Error(
      `Configured Android package is "${resolvedApp.identifier}", but the override app resolved to "${appOverride.resolvedIdentifier}".`,
    );
  }

  if (resolvedApp.platform === PLATFORM_WEB) {
    throw new Error('App overrides are not supported for platform "web".');
  }

  throw new Error(
    `Configured iOS bundle ID is "${resolvedApp.identifier}", but the override app resolved to "${appOverride.resolvedIdentifier}".`,
  );
}

function normalizePlatform(
  value: string | undefined,
  label: string,
  options?: { allowUndefined?: boolean },
): SupportedPlatform | undefined {
  if (value === undefined || value === null) {
    if (options?.allowUndefined) {
      return undefined;
    }
    throw new Error(`${label} must be android, ios, or web.`);
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === PLATFORM_ANDROID ||
    normalized === PLATFORM_IOS ||
    normalized === PLATFORM_WEB
  ) {
    return normalized;
  }

  throw new Error(`${label} must be android, ios, or web.`);
}

async function resolveAndroidPackageName(appPath: string): Promise<string> {
  const toolErrors: string[] = [];
  const aaptCandidates = await resolveAndroidToolCandidates('aapt');
  for (const candidate of aaptCandidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['dump', 'badging', appPath]);
      const match = stdout.toString().match(/^package: name='([^']+)'/m);
      if (match?.[1]) {
        return match[1];
      }
      toolErrors.push(`${path.basename(candidate)} did not return a package name.`);
    } catch (error) {
      toolErrors.push(formatExecError(candidate, error));
    }
  }

  const apkanalyzerCandidates = await resolveAndroidToolCandidates('apkanalyzer');
  for (const candidate of apkanalyzerCandidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['manifest', 'application-id', appPath]);
      const packageName = stdout.toString().trim();
      if (packageName.length > 0) {
        return packageName;
      }
      toolErrors.push(`${path.basename(candidate)} did not return a package name.`);
    } catch (error) {
      toolErrors.push(formatExecError(candidate, error));
    }
  }

  if (aaptCandidates.length === 0 && apkanalyzerCandidates.length === 0) {
    throw new Error(
      `Unable to resolve the Android package name from ${appPath}. Install Android build-tools (aapt) or Android cmdline-tools (apkanalyzer) to use --app with Android overrides.`,
    );
  }

  throw new Error(
    `Unable to resolve the Android package name from ${appPath}. ${toolErrors[0] ?? 'No compatible Android package resolver succeeded.'}`,
  );
}

async function resolveIOSBundleId(appPath: string): Promise<string> {
  const plistPath = await findIOSInfoPlist(appPath);
  if (!plistPath) {
    throw new Error(`Unable to resolve the iOS bundle ID from ${appPath}. Info.plist was not found.`);
  }

  try {
    const { stdout } = await execFileAsync('plutil', [
      '-extract',
      'CFBundleIdentifier',
      'raw',
      '-o',
      '-',
      plistPath,
    ]);
    const bundleId = stdout.toString().trim();
    if (bundleId.length > 0) {
      return bundleId;
    }
  } catch {
    // Fall back to parsing a text plist when plutil is unavailable or the file is plain XML.
  }

  const rawPlist = await fs.readFile(plistPath, 'utf-8').catch(() => '');
  const match = rawPlist.match(
    /<key>\s*CFBundleIdentifier\s*<\/key>\s*<string>\s*([^<\s][^<]*)\s*<\/string>/,
  );
  if (match?.[1]) {
    return match[1].trim();
  }

  throw new Error(`Unable to resolve the iOS bundle ID from ${appPath}. CFBundleIdentifier was not found in ${plistPath}.`);
}

async function findIOSInfoPlist(appPath: string): Promise<string | null> {
  const candidates = [
    path.join(appPath, 'Info.plist'),
    path.join(appPath, 'Contents', 'Info.plist'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function resolveAndroidToolCandidates(toolName: 'aapt' | 'apkanalyzer'): Promise<string[]> {
  const candidates: string[] = [];
  const androidSdkRoots = [
    process.env['ANDROID_HOME'],
    process.env['ANDROID_SDK_ROOT'],
  ].filter((value): value is string => Boolean(value));

  for (const androidSdkRoot of androidSdkRoots) {
    if (toolName === 'aapt') {
      const buildToolsDir = path.join(androidSdkRoot, 'build-tools');
      const versions = await fs.readdir(buildToolsDir).catch(() => []);
      versions
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
        .forEach((version) => {
          candidates.push(path.join(buildToolsDir, version, toolName));
        });
    }

    if (toolName === 'apkanalyzer') {
      candidates.push(path.join(androidSdkRoot, 'cmdline-tools', 'latest', 'bin', toolName));
      candidates.push(path.join(androidSdkRoot, 'tools', 'bin', toolName));
    }
  }

  const resolvedOnPath = await resolveOnPath(toolName);
  if (resolvedOnPath) {
    candidates.push(resolvedOnPath);
  }

  return dedupeExistingPaths(candidates);
}

async function resolveOnPath(command: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('which', [command]);
    const resolvedPath = stdout.toString().trim();
    if (!resolvedPath) {
      return null;
    }
    return resolvedPath;
  } catch {
    return null;
  }
}

async function dedupeExistingPaths(candidatePaths: string[]): Promise<string[]> {
  const uniquePaths: string[] = [];
  const seen = new Set<string>();

  for (const candidatePath of candidatePaths) {
    if (seen.has(candidatePath)) {
      continue;
    }
    seen.add(candidatePath);
    if (await pathExists(candidatePath)) {
      uniquePaths.push(candidatePath);
    }
  }

  return uniquePaths;
}

function formatExecError(commandPath: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${path.basename(commandPath)} failed: ${message}`;
}

function formatOverridePlatformMismatch(
  overridePlatform: SupportedPlatform,
  selectedPlatform: SupportedPlatform,
): string {
  return `App override platform is "${overridePlatform}", but the selected platform is "${selectedPlatform}".`;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a YAML mapping.`);
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `${label} contains unsupported key "${key}". Supported keys: ${Array.from(allowedKeys).join(', ')}.`,
      );
    }
  }
}

function readOptionalTrimmedString(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return normalizedValue;
}

function readRequiredTrimmedString(value: unknown, label: string): string {
  const normalizedValue = readOptionalTrimmedString(value, label);
  if (!normalizedValue) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return normalizedValue;
}

function readOptionalBrowser(
  value: unknown,
  label: string,
): 'chromium' | 'firefox' | 'webkit' | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalizedValue = value.trim().toLowerCase();
  if (
    normalizedValue === 'chromium' ||
    normalizedValue === 'firefox' ||
    normalizedValue === 'webkit'
  ) {
    return normalizedValue;
  }

  throw new Error(`${label} must be chromium, firefox, or webkit.`);
}

function readOptionalViewport(
  value: unknown,
  label: string,
): { width: number; height: number } | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  assertPlainObject(value, label);
  assertAllowedKeys(value, WEB_VIEWPORT_TOP_LEVEL_KEYS, label);
  return {
    width: readPositiveInteger(value['width'], `${label} width`),
    height: readPositiveInteger(value['height'], `${label} height`),
  };
}

function readPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function assertValidUrl(value: string, label: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new Error(`${label} must be a valid http or https URL.`);
  }
}
