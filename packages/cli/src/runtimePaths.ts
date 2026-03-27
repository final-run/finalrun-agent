import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

interface FinalRunPackageJson {
  name?: string;
  version?: string;
  bin?: Record<string, string>;
}

function readJsonFile(filePath: string): FinalRunPackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FinalRunPackageJson;
  } catch {
    return undefined;
  }
}

function isCliPackageJson(packageJson: FinalRunPackageJson | undefined): boolean {
  return packageJson?.name === 'finalrun' ||
    packageJson?.name === '@finalrun/cli' ||
    packageJson?.bin?.['finalrun'] !== undefined;
}

function findCliPackageRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath) && isCliPackageJson(readJsonFile(packageJsonPath))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(`Could not find the FinalRun CLI package root from ${startDir}`);
    }
    currentDir = parentDir;
  }
}

export function resolveCliPackageRoot(startDir: string = __dirname): string {
  return findCliPackageRoot(startDir);
}

export function resolveCliPackageVersion(startDir: string = __dirname): string {
  const packageJsonPath = path.join(resolveCliPackageRoot(startDir), 'package.json');
  const packageJson = readJsonFile(packageJsonPath);
  return packageJson?.version ?? '0.0.0';
}

export function resolveCliCacheRoot(startDir: string = __dirname): string {
  const overrideRoot = process.env['FINALRUN_CACHE_DIR'];
  if (overrideRoot && overrideRoot.trim()) {
    return path.resolve(overrideRoot, resolveCliPackageVersion(startDir));
  }

  return path.join(os.homedir(), '.finalrun', 'assets', resolveCliPackageVersion(startDir));
}

export function resolveCliLaunchArgs(
  args: readonly string[],
  startDir: string = __dirname,
): string[] {
  const compiledBinPath = path.resolve(startDir, '../bin/finalrun.js');
  if (fs.existsSync(compiledBinPath)) {
    return [compiledBinPath, ...args];
  }

  const sourceBinCandidates = [
    path.resolve(startDir, '../bin/finalrun.ts'),
    path.resolve(startDir, '../../bin/finalrun.ts'),
  ];
  const tsxCliCandidates = [
    path.resolve(startDir, '../../../node_modules/tsx/dist/cli.mjs'),
    path.resolve(startDir, '../../../../node_modules/tsx/dist/cli.mjs'),
  ];
  const tsconfigCandidates = [
    path.resolve(startDir, '../../../tsconfig.dev.json'),
    path.resolve(startDir, '../../../../tsconfig.dev.json'),
  ];

  const sourceBinPath = sourceBinCandidates.find((candidate) => fs.existsSync(candidate));
  const tsxCliPath = tsxCliCandidates.find((candidate) => fs.existsSync(candidate));
  const tsconfigPath = tsconfigCandidates.find((candidate) => fs.existsSync(candidate));
  if (sourceBinPath && tsxCliPath && tsconfigPath) {
    return [tsxCliPath, '--tsconfig', tsconfigPath, sourceBinPath, ...args];
  }

  throw new Error('Could not resolve a FinalRun CLI entrypoint for background report server startup.');
}

export function initializeCliRuntimeEnvironment(startDir: string = __dirname): void {
  if (!process.env['FINALRUN_DRIVER_PROTO_PATH']) {
    const packageRoot = resolveCliPackageRoot(startDir);
    const candidates = [
      path.join(packageRoot, 'proto', 'finalrun', 'driver.proto'),
      path.resolve(packageRoot, '../../proto/finalrun/driver.proto'),
      path.resolve(packageRoot, '../proto/finalrun/driver.proto'),
    ];

    const resolvedProtoPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (resolvedProtoPath) {
      process.env['FINALRUN_DRIVER_PROTO_PATH'] = resolvedProtoPath;
    }
  }
}
