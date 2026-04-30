import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertPathWithinRoot, isYamlFile } from './workspace.js';

export const TEST_SELECTION_REQUIRED_ERROR =
  'At least one test selector is required. Pass a YAML file, directory, or glob under .finalrun/tests.';

export interface SelectTestFilesOptions {
  requireSelection?: boolean;
}

export function normalizeTestSelectors(
  selectors?: readonly string[],
): string[] {
  if (!selectors) {
    return [];
  }

  return selectors.flatMap((selector) =>
    selector
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

export async function selectTestFiles(
  testsDir: string,
  selectors?: string[],
  options?: SelectTestFilesOptions,
): Promise<string[]> {
  const normalizedSelectors = normalizeTestSelectors(selectors);
  const allTestFiles = (await collectYamlFiles(testsDir)).sort();

  if (normalizedSelectors.length === 0) {
    if (options?.requireSelection) {
      throw new Error(TEST_SELECTION_REQUIRED_ERROR);
    }
    if (allTestFiles.length === 0) {
      throw new Error(`No YAML tests found under ${testsDir}`);
    }
    return allTestFiles;
  }

  const selectedFiles = new Set<string>();
  for (const selector of normalizedSelectors) {
    const matchedFiles = await expandSelector(testsDir, selector, allTestFiles);
    for (const filePath of matchedFiles) {
      selectedFiles.add(filePath);
    }
  }

  return Array.from(selectedFiles);
}

async function expandSelector(
  testsDir: string,
  selector: string,
  allTestFiles: string[],
): Promise<string[]> {
  if (!hasGlobMagic(selector)) {
    const resolvedPath = resolveSelectorPath(selector, testsDir);
    assertPathWithinRoot(testsDir, resolvedPath, 'Test selector');

    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (stats?.isDirectory()) {
      return expandDirectorySelector(testsDir, selector, resolvedPath, allTestFiles);
    }

    if (!isYamlFile(resolvedPath)) {
      throw new Error(`Test selector must point to a .yaml or .yml file: ${selector}`);
    }
    if (!stats?.isFile()) {
      const similar = findSimilarFiles(selector, allTestFiles, testsDir);
      const suggestion = similar.length > 0
        ? `\n\nDid you mean?\n${similar.map(f => `  - ${f}`).join('\n')}`
        : '';
      throw new Error(`Test file not found: ${selector}${suggestion}`);
    }
    return [resolvedPath];
  }

  const pattern = normalizeGlobSelector(selector, testsDir);
  const matcher = globToRegExp(pattern);
  const matchedFiles = allTestFiles.filter((filePath) => {
    const relativePath = path.relative(testsDir, filePath).split(path.sep).join('/');
    return matcher.test(relativePath);
  });

  if (matchedFiles.length === 0) {
    throw new Error(`No tests matched selector "${selector}" inside ${testsDir}`);
  }

  return matchedFiles;
}

function expandDirectorySelector(
  testsDir: string,
  selector: string,
  directoryPath: string,
  allTestFiles: string[],
): string[] {
  const matchedFiles = allTestFiles.filter((filePath) =>
    isPathWithinDirectory(directoryPath, filePath),
  );

  if (matchedFiles.length === 0) {
    throw new Error(`No YAML tests found under selector "${selector}" inside ${testsDir}`);
  }

  return matchedFiles;
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function resolveSelectorPath(selector: string, testsDir: string): string {
  const normalizedSelector = selector.split(path.sep).join('/');
  const workspaceRoot = path.resolve(testsDir, '..', '..');
  if (path.isAbsolute(selector)) {
    return path.resolve(selector);
  }

  if (normalizedSelector.startsWith('.finalrun/tests/')) {
    return path.resolve(workspaceRoot, selector);
  }

  return path.resolve(testsDir, selector);
}

function normalizeGlobSelector(selector: string, testsDir: string): string {
  if (path.isAbsolute(selector)) {
    assertPathWithinRoot(testsDir, selector, 'Test selector');
    return path.relative(testsDir, selector).split(path.sep).join('/');
  }

  const normalizedSelector = selector.split(path.sep).join('/');
  if (normalizedSelector.startsWith('.finalrun/tests/')) {
    const relativePattern = normalizedSelector.replace(/^\.finalrun\/tests\//, '');
    if (relativePattern.startsWith('..')) {
      throw new Error(`Test selector must stay inside ${testsDir}`);
    }
    return relativePattern;
  }

  if (normalizedSelector.startsWith('../')) {
    throw new Error(`Test selector must stay inside ${testsDir}`);
  }

  return normalizedSelector.replace(/^\.\//, '');
}

function isPathWithinDirectory(directoryPath: string, candidatePath: string): boolean {
  const relative = path.relative(directoryPath, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function globToRegExp(pattern: string): RegExp {
  const segments = pattern.split('/');
  const parts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment === '**') {
      const isLast = i === segments.length - 1;
      if (isLast) {
        if (parts.length > 0) {
          parts.push('/');
        }
        parts.push('.*');
      } else {
        // Match zero or more directory levels (including none).
        // When preceded by a literal segment (e.g. auth/**/), include
        // the leading slash so "auth" doesn't prefix-match "authz".
        if (parts.length > 0) {
          parts.push('/(?:.*/)?');
        } else {
          parts.push('(?:.*/)?');
        }
      }
    } else {
      const escaped = segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      if (parts.length > 0 && !parts[parts.length - 1].endsWith(')?')) {
        parts.push('/');
      }
      parts.push(escaped);
    }
  }

  return new RegExp(`^${parts.join('')}$`);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findSimilarFiles(selector: string, allTestFiles: string[], testsDir: string): string[] {
  const maxDistance = Math.ceil(selector.length * 0.4);
  const scored = allTestFiles
    .map((filePath) => {
      const relative = path.relative(testsDir, filePath).split(path.sep).join('/');
      return { relative, distance: levenshteinDistance(selector, relative) };
    })
    .filter((entry) => entry.distance > 0 && entry.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3).map((entry) => entry.relative);
}

async function collectYamlFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await collectYamlFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && isYamlFile(fullPath)) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}
