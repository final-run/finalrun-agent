import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PLATFORM_ANDROID, PLATFORM_IOS } from '@finalrun/common';
import YAML from 'yaml';

export interface FinalRunWorkspace {
  rootDir: string;
  finalrunDir: string;
  testsDir: string;
  suitesDir: string;
  envDir: string;
  artifactsDir: string;
}

export interface AppOverrideValidationResult {
  appPath: string;
  inferredPlatform: string;
}

export interface WorkspaceConfig {
  env?: string;
  model?: string;
}

export interface ResolvedEnvironmentFile {
  envName: string;
  envPath?: string;
  availableEnvNames: string[];
  usesEmptyBindings: boolean;
}

const WORKSPACE_CONFIG_TOP_LEVEL_KEYS = new Set(['env', 'model']);

export async function resolveWorkspace(
  cwd: string = process.cwd(),
): Promise<FinalRunWorkspace> {
  let currentDir = path.resolve(cwd);

  while (true) {
    const finalrunDir = path.join(currentDir, '.finalrun');
    if (await pathExists(finalrunDir)) {
      return {
        rootDir: currentDir,
        finalrunDir,
        testsDir: path.join(finalrunDir, 'tests'),
        suitesDir: path.join(finalrunDir, 'suites'),
        envDir: path.join(finalrunDir, 'env'),
        artifactsDir: path.join(finalrunDir, 'artifacts'),
      };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(
    'Could not find a .finalrun workspace. Run the CLI from a repository containing .finalrun/.',
  );
}

export async function ensureWorkspaceDirectories(
  workspace: FinalRunWorkspace,
): Promise<void> {
  if (!(await pathExists(workspace.testsDir))) {
    throw new Error(`Missing .finalrun/tests directory: ${workspace.testsDir}`);
  }

  await fs.mkdir(workspace.artifactsDir, { recursive: true });
}

export function assertPathWithinRoot(
  rootDir: string,
  candidatePath: string,
  description: string,
): void {
  const relative = path.relative(rootDir, candidatePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${description} must stay inside ${rootDir}`);
  }
}

export function sanitizeSpecId(relativePath: string): string {
  return relativePath
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/]+/g, '__')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-');
}

export function createRunId(params: {
  envName: string;
  platform: string;
  startedAt: Date;
}): string {
  const timestamp = params.startedAt.toISOString().replace(/[:]/g, '-');
  return `${timestamp}-${params.envName}-${params.platform}`;
}

export async function validateAppOverride(
  appPath: string,
  platform?: string,
): Promise<AppOverrideValidationResult> {
  const resolvedPath = path.resolve(appPath);
  const stats = await fs.stat(resolvedPath).catch(() => null);
  if (!stats) {
    throw new Error(`App override not found: ${resolvedPath}`);
  }

  const lowerPath = resolvedPath.toLowerCase();
  if (lowerPath.endsWith('.apk')) {
    if (!stats.isFile()) {
      throw new Error('Android .apk overrides must point to an APK file.');
    }
    if (platform && platform !== PLATFORM_ANDROID) {
      throw new Error('Android .apk overrides require --platform android.');
    }
    return {
      appPath: resolvedPath,
      inferredPlatform: PLATFORM_ANDROID,
    };
  }

  if (lowerPath.endsWith('.app')) {
    if (!stats.isDirectory()) {
      throw new Error('iOS .app overrides must point to an extracted .app bundle directory.');
    }
    if (platform && platform !== PLATFORM_IOS) {
      throw new Error('iOS .app overrides require --platform ios.');
    }
    return {
      appPath: resolvedPath,
      inferredPlatform: PLATFORM_IOS,
    };
  }

  throw new Error('Unsupported --app override. Expected an Android .apk or iOS simulator .app.');
}

export function isYamlFile(filePath: string): boolean {
  return /\.ya?ml$/i.test(filePath);
}

export async function resolveSuiteManifestPath(
  suitesDir: string,
  suitePath: string,
): Promise<string> {
  if (!(await pathExists(suitesDir))) {
    throw new Error(`Missing .finalrun/suites directory: ${suitesDir}`);
  }

  const resolvedPath = resolveWorkspaceScopedPath(suitePath, suitesDir, '.finalrun/suites/');
  assertPathWithinRoot(suitesDir, resolvedPath, 'Suite manifest');

  if (!isYamlFile(resolvedPath)) {
    throw new Error(`Suite manifest must point to a .yaml or .yml file: ${suitePath}`);
  }

  const stats = await fs.stat(resolvedPath).catch(() => null);
  if (!stats?.isFile()) {
    throw new Error(`Suite manifest not found: ${resolvedPath}`);
  }

  return resolvedPath;
}

export async function resolveEnvironmentFile(
  envDir: string,
  requestedEnvName?: string,
): Promise<ResolvedEnvironmentFile> {
  const envDirExists = await pathExists(envDir);
  const environmentFiles = await listEnvironmentFiles(envDir);
  const availableEnvNames = environmentFiles.map((entry) => entry.envName);
  const duplicateNames = findDuplicateEnvironmentNames(availableEnvNames);
  if (duplicateNames.length > 0) {
    throw new Error(
      `Environment files in ${envDir} contain duplicate names: ${duplicateNames.join(', ')}.`,
    );
  }

  if (requestedEnvName) {
    const explicitMatch = environmentFiles.find(
      (entry) => entry.envName === requestedEnvName,
    );
    if (!explicitMatch) {
      throw new Error(
        formatMissingEnvironmentError(
          envDir,
          requestedEnvName,
          availableEnvNames,
          envDirExists,
        ),
      );
    }
    return {
      envName: explicitMatch.envName,
      envPath: explicitMatch.envPath,
      availableEnvNames,
      usesEmptyBindings: false,
    };
  }

  if (environmentFiles.length === 0) {
    return {
      envName: 'none',
      availableEnvNames,
      usesEmptyBindings: true,
    };
  }

  const devMatch = environmentFiles.find((entry) => entry.envName === 'dev');
  if (devMatch) {
    return {
      envName: devMatch.envName,
      envPath: devMatch.envPath,
      availableEnvNames,
      usesEmptyBindings: false,
    };
  }

  if (environmentFiles.length === 1) {
    return {
      envName: environmentFiles[0]!.envName,
      envPath: environmentFiles[0]!.envPath,
      availableEnvNames,
      usesEmptyBindings: false,
    };
  }

  throw new Error(
    `Multiple environments are available in ${envDir}. Pass --env <name>. Available environments: ${availableEnvNames.join(', ')}`,
  );
}

export async function loadWorkspaceConfig(finalrunDir: string): Promise<WorkspaceConfig> {
  const configPath = path.join(finalrunDir, 'config.yaml');
  if (!(await pathExists(configPath))) {
    return {};
  }

  const raw = await fs.readFile(configPath, 'utf-8').catch(() => {
    throw new Error(`Workspace config file not found: ${configPath}`);
  });

  const parsed = parseYamlDocument(raw, configPath);
  if (parsed === undefined || parsed === null) {
    return {};
  }

  assertPlainObject(parsed, `Workspace config ${configPath}`);
  assertAllowedKeys(parsed, WORKSPACE_CONFIG_TOP_LEVEL_KEYS, `Workspace config ${configPath}`);

  return {
    env: readOptionalTrimmedString(parsed['env'], `${configPath} env`, {
      allowEmpty: false,
    }),
    model: readOptionalTrimmedString(parsed['model'], `${configPath} model`, {
      allowEmpty: true,
    }),
  };
}

export async function resolveConfiguredEnvironmentFile(
  workspace: FinalRunWorkspace,
  requestedEnvName?: string,
): Promise<ResolvedEnvironmentFile> {
  const workspaceConfig = await loadWorkspaceConfig(workspace.finalrunDir);
  return resolveEnvironmentFile(
    workspace.envDir,
    requestedEnvName ?? workspaceConfig.env,
  );
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function listEnvironmentFiles(
  envDir: string,
): Promise<Array<{ envName: string; envPath: string }>> {
  if (!(await pathExists(envDir))) {
    return [];
  }
  const entries = await fs.readdir(envDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isYamlFile(entry.name))
    .map((entry) => ({
      envName: path.basename(entry.name, path.extname(entry.name)),
      envPath: path.join(envDir, entry.name),
    }))
    .sort((left, right) => left.envName.localeCompare(right.envName));
}

function findDuplicateEnvironmentNames(envNames: string[]): string[] {
  const counts = new Map<string, number>();
  for (const envName of envNames) {
    counts.set(envName, (counts.get(envName) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([envName]) => envName)
    .sort((left, right) => left.localeCompare(right));
}

function formatMissingEnvironmentError(
  envDir: string,
  requestedEnvName: string,
  availableEnvNames: string[],
  envDirExists: boolean,
): string {
  if (!envDirExists) {
    return `Environment "${requestedEnvName}" was requested, but ${envDir} does not exist. Create .finalrun/env/${requestedEnvName}.yaml or omit --env for env-free specs.`;
  }
  if (availableEnvNames.length === 0) {
    return `Environment "${requestedEnvName}" was not found in ${envDir}, and no environment files are available there. Create .finalrun/env/${requestedEnvName}.yaml or omit --env for env-free specs.`;
  }

  return `Environment "${requestedEnvName}" was not found in ${envDir}. Available environments: ${availableEnvNames.join(', ')}`;
}

function resolveWorkspaceScopedPath(
  candidatePath: string,
  scopedRootDir: string,
  workspacePrefix: string,
): string {
  const normalizedCandidatePath = candidatePath.split(path.sep).join('/');
  const workspaceRoot = path.resolve(scopedRootDir, '..', '..');
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath);
  }

  if (normalizedCandidatePath.startsWith(workspacePrefix)) {
    return path.resolve(workspaceRoot, candidatePath);
  }

  return path.resolve(scopedRootDir, candidatePath);
}

function parseYamlDocument(raw: string, filePath: string): unknown {
  const document = YAML.parseDocument(raw);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new Error(`Invalid YAML in ${filePath}: ${firstError.message}`);
  }
  return document.toJS();
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a YAML mapping at the top level.`);
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
  options?: { allowEmpty?: boolean },
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const normalizedValue = value.trim();
  if (!options?.allowEmpty && normalizedValue.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return normalizedValue;
}
