import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import {
  PLATFORM_ANDROID,
  PLATFORM_IOS,
  type RepoAndroidAppConfig,
  type RepoAppConfig,
  type RepoIOSAppConfig,
} from '@finalrun/common';

const execFileAsync = promisify(execFile);
const APP_TOP_LEVEL_KEYS = new Set(['android', 'ios']);
const ANDROID_APP_KEYS = new Set(['name', 'packageName']);
const IOS_APP_KEYS = new Set(['name', 'bundleId']);

type SupportedPlatform = typeof PLATFORM_ANDROID | typeof PLATFORM_IOS;

export interface ResolvedAppConfig {
  platform: SupportedPlatform;
  identifier: string;
  identifierKind: 'packageName' | 'bundleId';
  name?: string;
  sourceEnvName?: string;
}

export interface ValidatedAppOverrideLike {
  appPath: string;
  inferredPlatform: string;
  resolvedIdentifier?: string;
}

export function readRepoAppConfig(
  value: unknown,
  label: string,
): RepoAppConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  assertPlainObject(value, label);
  assertAllowedKeys(value, APP_TOP_LEVEL_KEYS, label);

  const android = value['android'] !== undefined
    ? readAndroidAppConfig(value['android'], `${label} android`)
    : undefined;
  const ios = value['ios'] !== undefined
    ? readIOSAppConfig(value['ios'], `${label} ios`)
    : undefined;

  if (!android && !ios) {
    throw new Error(`${label} must define at least one platform.`);
  }

  return {
    android,
    ios,
  };
}

export function resolveAppConfig(params: {
  workspaceApp: RepoAppConfig | undefined;
  environmentApp?: RepoAppConfig;
  envName: string;
  requestedPlatform?: string;
  appOverride?: ValidatedAppOverrideLike;
}): ResolvedAppConfig {
  const workspaceApp = params.workspaceApp;
  if (!workspaceApp?.android && !workspaceApp?.ios) {
    throw new Error(
      '.finalrun/config.yaml must define app.android.packageName and/or app.ios.bundleId. App config is required for FinalRun runs.',
    );
  }

  if (params.environmentApp?.android && !workspaceApp.android) {
    throw new Error(
      `Environment "${params.envName}" overrides app.android.packageName, but .finalrun/config.yaml does not define app.android.packageName.`,
    );
  }
  if (params.environmentApp?.ios && !workspaceApp.ios) {
    throw new Error(
      `Environment "${params.envName}" overrides app.ios.bundleId, but .finalrun/config.yaml does not define app.ios.bundleId.`,
    );
  }

  const platform = resolveSelectedPlatform({
    requestedPlatform: params.requestedPlatform,
    inferredPlatform: params.appOverride?.inferredPlatform,
    workspaceApp,
  });

  if (platform === PLATFORM_ANDROID) {
    const baseConfig = workspaceApp.android;
    if (!baseConfig) {
      throw new Error(
        'No app config found for platform "android". Add app.android.packageName to .finalrun/config.yaml or choose a different --platform.',
      );
    }
    const overrideConfig = params.environmentApp?.android;
    const resolved = {
      platform,
      identifier: overrideConfig?.packageName ?? baseConfig.packageName,
      identifierKind: 'packageName' as const,
      name: overrideConfig?.name ?? baseConfig.name,
      sourceEnvName: overrideConfig ? params.envName : undefined,
    };
    validateResolvedOverrideMatch(params.appOverride, resolved);
    return resolved;
  }

  const baseConfig = workspaceApp.ios;
  if (!baseConfig) {
    throw new Error(
      'No app config found for platform "ios". Add app.ios.bundleId to .finalrun/config.yaml or choose a different --platform.',
    );
  }
  const overrideConfig = params.environmentApp?.ios;
  const resolved = {
    platform,
    identifier: overrideConfig?.bundleId ?? baseConfig.bundleId,
    identifierKind: 'bundleId' as const,
    name: overrideConfig?.name ?? baseConfig.name,
    sourceEnvName: overrideConfig ? params.envName : undefined,
  };
  validateResolvedOverrideMatch(params.appOverride, resolved);
  return resolved;
}

export function formatResolvedAppSummary(app: ResolvedAppConfig): string {
  return app.platform === PLATFORM_ANDROID
    ? `Using Android package: ${app.identifier}`
    : `Using iOS bundle ID: ${app.identifier}`;
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

function readAndroidAppConfig(
  value: unknown,
  label: string,
): RepoAndroidAppConfig {
  assertPlainObject(value, label);
  assertAllowedKeys(value, ANDROID_APP_KEYS, label);

  return {
    name: readOptionalTrimmedString(value['name'], `${label} name`),
    packageName: readRequiredTrimmedString(value['packageName'], `${label} packageName`),
  };
}

function readIOSAppConfig(
  value: unknown,
  label: string,
): RepoIOSAppConfig {
  assertPlainObject(value, label);
  assertAllowedKeys(value, IOS_APP_KEYS, label);

  return {
    name: readOptionalTrimmedString(value['name'], `${label} name`),
    bundleId: readRequiredTrimmedString(value['bundleId'], `${label} bundleId`),
  };
}

function resolveSelectedPlatform(params: {
  requestedPlatform?: string;
  inferredPlatform?: string;
  workspaceApp: RepoAppConfig;
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
    params.workspaceApp.android ? PLATFORM_ANDROID : null,
    params.workspaceApp.ios ? PLATFORM_IOS : null,
  ].filter((platform): platform is SupportedPlatform => platform !== null);

  if (configuredPlatforms.length === 1) {
    return configuredPlatforms[0]!;
  }

  throw new Error(
    'Both Android and iOS apps are configured. Pass --platform android or --platform ios.',
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
    throw new Error(`${label} must be android or ios.`);
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === PLATFORM_ANDROID || normalized === PLATFORM_IOS) {
    return normalized;
  }

  throw new Error(`${label} must be android or ios.`);
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

function readRequiredTrimmedString(
  value: unknown,
  label: string,
): string {
  const normalizedValue = readOptionalTrimmedString(value, label);
  if (!normalizedValue) {
    throw new Error(`${label} must be a string.`);
  }
  return normalizedValue;
}
