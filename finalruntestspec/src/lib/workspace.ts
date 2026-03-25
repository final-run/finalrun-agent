import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.yarn',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'tmp',
]);

export interface ResolvedWorkspacePaths {
  cwd: string;
  frtestspecDir: string;
  configPath: string;
  changesRoot: string;
  finalrunDir: string;
  testsDir: string;
  suitesDir: string;
  codexDir: string;
  codexSkillsDir: string;
}

export interface ResolvedChangePaths extends ResolvedWorkspacePaths {
  changeDir: string;
  planPath: string;
}

export interface CollectFilesOptions {
  allowedExtensions?: readonly string[];
  ignoredDirs?: ReadonlySet<string>;
  maxFileSizeBytes?: number;
}

export function resolveWorkspacePaths(cwd: string): ResolvedWorkspacePaths {
  const normalizedCwd = path.resolve(cwd);
  const finalrunDir = path.join(normalizedCwd, '.finalrun');
  const frtestspecDir = path.join(normalizedCwd, 'frtestspec');
  const codexDir = path.join(normalizedCwd, '.codex');
  return {
    cwd: normalizedCwd,
    frtestspecDir,
    configPath: path.join(frtestspecDir, 'config.yaml'),
    changesRoot: path.join(frtestspecDir, 'changes'),
    finalrunDir,
    testsDir: path.join(finalrunDir, 'tests'),
    suitesDir: path.join(finalrunDir, 'suites'),
    codexDir,
    codexSkillsDir: path.join(codexDir, 'skills'),
  };
}

export function resolveChangePaths(
  cwd: string,
  featureName: string,
): ResolvedChangePaths {
  const workspace = resolveWorkspacePaths(cwd);
  const changeDir = path.join(workspace.changesRoot, featureName);
  return {
    ...workspace,
    changeDir,
    planPath: path.join(changeDir, 'test-plan.md'),
  };
}

/**
 * Checks if a path exists on the filesystem.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures that a directory exists.
 * Creates the directory and its parents recursively if necessary.
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Ensures that the parent directory of a given file path exists.
 * Creates directories recursively if necessary.
 */
export async function ensureParentDirectory(filePath: string): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
}

/**
 * Recursively collects files in a directory that match specific criteria.
 *
 * @param dirPath - The directory to scan.
 * @param options - Filtering and limit options.
 * @returns A list of absolute file paths.
 */
export async function collectFiles(
  dirPath: string,
  options: CollectFilesOptions = {},
): Promise<string[]> {
  const results: string[] = [];
  if (!(await pathExists(dirPath))) {
    return results;
  }

  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const allowedExtensions = options.allowedExtensions
    ? new Set(options.allowedExtensions.map((value) => value.toLowerCase()))
    : null;

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (allowedExtensions) {
          const extension = path.extname(entry.name).toLowerCase();
          if (!allowedExtensions.has(extension)) {
            continue;
          }
        }

        if (options.maxFileSizeBytes) {
          const stats = await fs.stat(fullPath);
          if (stats.size > options.maxFileSizeBytes) {
            continue;
          }
        }

        results.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return results.sort();
}

/**
 * Normalizes a path to use Posix-style forward slashes.
 */
export function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Converts an absolute path into a workspace-relative path.
 *
 * @param cwd - The workspace root directory.
 * @param absolutePath - The path to convert.
 * @returns A relative path using forward slashes.
 */
export function toWorkspaceRelativePath(cwd: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(cwd), path.resolve(absolutePath));
  if (relative === '') {
    return '.';
  }

  // If the path is outside the cwd, return the absolute posix path
  if (relative.startsWith('..')) {
    return toPosixPath(path.resolve(absolutePath));
  }

  return toPosixPath(relative);
}

/**
 * Resolves a plan path, making it absolute relative to the CWD if it's not already absolute.
 *
 * @param cwd - The current working directory.
 * @param planPath - The plan path to resolve.
 * @returns An absolute path to the plan.
 */
export function resolvePlanPath(cwd: string, planPath: string): string {
  if (path.isAbsolute(planPath)) {
    return path.resolve(planPath);
  }

  return path.resolve(cwd, planPath);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

const TOOL_SKILLS_DIRS: Record<string, string> = {
  codex: '.codex/skills',
  antigravity: '.gemini/antigravity/skills',
  opencode: '.opencode/skills',
  claudecode: '.claude/skills',
  cursor: '.cursor/skills',
  copilot: '.github/copilot/skills',
};

export function resolveSkillsDir(cwd: string, tool: string, scope: 'local' | 'global' = 'local'): string {
  const relative = TOOL_SKILLS_DIRS[tool];
  if (!relative) {
    throw new Error(`No skills directory mapping for tool '${tool}'.`);
  }
  const root = scope === 'global' ? os.homedir() : path.resolve(cwd);
  return path.join(root, relative);
}
