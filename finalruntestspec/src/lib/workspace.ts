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

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectory(targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
}

export async function ensureParentDirectory(targetPath: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
}

export async function collectFiles(
  rootDir: string,
  options: CollectFilesOptions = {},
): Promise<string[]> {
  if (!(await pathExists(rootDir))) {
    return [];
  }

  const ignoredDirs = options.ignoredDirs ?? DEFAULT_IGNORED_DIRS;
  const allowedExtensions = options.allowedExtensions
    ? new Set(options.allowedExtensions.map((value) => value.toLowerCase()))
    : null;
  const filePaths: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        await walk(path.join(currentDir, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const extension = path.extname(entry.name).toLowerCase();
      if (allowedExtensions && !allowedExtensions.has(extension)) {
        continue;
      }

      if (options.maxFileSizeBytes) {
        const stats = await fs.stat(fullPath);
        if (stats.size > options.maxFileSizeBytes) {
          continue;
        }
      }

      filePaths.push(fullPath);
    }
  }

  await walk(rootDir);
  return filePaths.sort();
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

export function toWorkspaceRelativePath(cwd: string, targetPath: string): string {
  const absoluteTarget = path.resolve(targetPath);
  const relativePath = path.relative(path.resolve(cwd), absoluteTarget);
  if (relativePath === '') {
    return '.';
  }

  if (relativePath.startsWith('..')) {
    return toPosixPath(absoluteTarget);
  }

  return toPosixPath(relativePath);
}

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
};

export function resolveSkillsDir(cwd: string, tool: string, scope: 'local' | 'global' = 'local'): string {
  const relative = TOOL_SKILLS_DIRS[tool];
  if (!relative) {
    throw new Error(`No skills directory mapping for tool '${tool}'.`);
  }
  const root = scope === 'global' ? os.homedir() : path.resolve(cwd);
  return path.join(root, relative);
}
