import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertPathWithinRoot, isYamlFile } from './workspace.js';

export async function selectSpecFiles(
  testsDir: string,
  selector?: string,
): Promise<string[]> {
  const allSpecFiles = (await collectYamlFiles(testsDir)).sort();
  if (!selector) {
    if (allSpecFiles.length === 0) {
      throw new Error(`No YAML specs found under ${testsDir}`);
    }
    return allSpecFiles;
  }

  if (!hasGlobMagic(selector)) {
    const resolvedPath = resolveSelectorPath(selector, testsDir);
    assertPathWithinRoot(testsDir, resolvedPath, 'Spec selector');
    if (!isYamlFile(resolvedPath)) {
      throw new Error(`Spec selector must point to a .yaml or .yml file: ${selector}`);
    }
    const stats = await fs.stat(resolvedPath).catch(() => null);
    if (!stats?.isFile()) {
      throw new Error(`Spec selector not found: ${resolvedPath}`);
    }
    return [resolvedPath];
  }

  const pattern = normalizeGlobSelector(selector, testsDir);
  const matcher = globToRegExp(pattern);
  const matchedFiles = allSpecFiles.filter((filePath) => {
    const relativePath = path.relative(testsDir, filePath).split(path.sep).join('/');
    return matcher.test(relativePath);
  });

  if (matchedFiles.length === 0) {
    throw new Error(`No specs matched selector "${selector}" inside ${testsDir}`);
  }

  return matchedFiles;
}

function hasGlobMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function resolveSelectorPath(selector: string, testsDir: string): string {
  const normalizedSelector = selector.split(path.sep).join('/');
  if (path.isAbsolute(selector)) {
    return path.resolve(selector);
  }

  if (normalizedSelector.startsWith('.finalrun/tests/')) {
    return path.resolve(process.cwd(), selector);
  }

  return path.resolve(testsDir, selector);
}

function normalizeGlobSelector(selector: string, testsDir: string): string {
  if (path.isAbsolute(selector)) {
    assertPathWithinRoot(testsDir, selector, 'Spec selector');
    return path.relative(testsDir, selector).split(path.sep).join('/');
  }

  const normalizedSelector = selector.split(path.sep).join('/');
  if (normalizedSelector.startsWith('.finalrun/tests/')) {
    const relativePattern = normalizedSelector.replace(/^\.finalrun\/tests\//, '');
    if (relativePattern.startsWith('..')) {
      throw new Error(`Spec selector must stay inside ${testsDir}`);
    }
    return relativePattern;
  }

  if (normalizedSelector.startsWith('../')) {
    throw new Error(`Spec selector must stay inside ${testsDir}`);
  }

  return normalizedSelector.replace(/^\.\//, '');
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('/')
    .map((segment) => {
      if (segment === '**') {
        return '.*';
      }

      return segment
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
    })
    .join('/');

  return new RegExp(`^${escaped}$`);
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
