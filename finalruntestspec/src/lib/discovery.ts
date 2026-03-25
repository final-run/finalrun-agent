import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PlanSource, OutputType } from './test-plan.js';
import {
  collectFiles,
  pathExists,
  resolveWorkspacePaths,
  toWorkspaceRelativePath,
  toPosixPath,
} from './workspace.js';

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml'];
const YAML_EXTENSIONS = ['.yaml', '.yml'];
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'create',
  'feature',
  'flow',
  'for',
  'from',
  'new',
  'screen',
  'test',
  'tests',
  'the',
  'this',
  'update',
  'user',
  'with',
]);

export interface DiscoverySource extends PlanSource {
  excerpt: string;
}

export interface PlanningDiscoveryContext {
  existingCoverage: {
    tests: string[];
    testsuite: string[];
  };
  sources: DiscoverySource[];
}

export interface BuildPlanningDiscoveryOptions {
  cwd: string;
  featureName: string;
  request: string;
  requestedOutputs: readonly OutputType[];
  contextFiles?: readonly string[];
}

export async function buildPlanningDiscoveryContext(
  options: BuildPlanningDiscoveryOptions,
): Promise<PlanningDiscoveryContext> {
  const workspace = resolveWorkspacePaths(options.cwd);
  const terms = extractSearchTerms(options.featureName, options.request);
  const providedSources = await loadProvidedSources(options.cwd, options.contextFiles ?? [], terms);
  const workspaceTestSources = await scanWorkspaceDirectory(
    options.cwd,
    workspace.testsDir,
    'workspace-test',
    terms,
  );
  const workspaceTestsuiteSources = await scanWorkspaceDirectory(
    options.cwd,
    workspace.suitesDir,
    'workspace-testsuite',
    terms,
  );

  const specSources = await scanSpecSources(options.cwd, terms);
  const shouldScanCode = providedSources.length > 0 || specSources.length === 0;
  const codeSources = shouldScanCode
    ? await scanCodeSources(options.cwd, terms)
    : [];

  const sources = [
    ...providedSources,
    ...workspaceTestSources,
    ...workspaceTestsuiteSources,
    ...specSources,
    ...codeSources,
  ];

  return {
    existingCoverage: {
      tests: workspaceTestSources.map((source) => source.path),
      testsuite: workspaceTestsuiteSources.map((source) => source.path),
    },
    sources,
  };
}

function extractSearchTerms(featureName: string, request: string): string[] {
  const rawText = `${featureName} ${request}`.toLowerCase();
  const terms = rawText
    .split(/[^a-z0-9]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && !STOPWORDS.has(value));
  return Array.from(new Set(terms));
}

async function loadProvidedSources(
  cwd: string,
  contextFiles: readonly string[],
  terms: readonly string[],
): Promise<DiscoverySource[]> {
  const sources: DiscoverySource[] = [];
  for (const providedPath of contextFiles) {
    const absolutePath = path.isAbsolute(providedPath)
      ? providedPath
      : path.resolve(cwd, providedPath);
    if (!(await pathExists(absolutePath))) {
      throw new Error(`Context file not found: ${providedPath}`);
    }

    const content = await fs.readFile(absolutePath, 'utf8');
    sources.push({
      type: 'provided-file',
      path: toWorkspaceRelativePath(cwd, absolutePath),
      relevance: 'User explicitly supplied this file as planning context.',
      excerpt: buildExcerpt(content, terms),
    });
  }
  return sources;
}

async function scanWorkspaceDirectory(
  cwd: string,
  directoryPath: string,
  sourceType: 'workspace-test' | 'workspace-testsuite',
  terms: readonly string[],
): Promise<DiscoverySource[]> {
  const files = await collectFiles(directoryPath, {
    allowedExtensions: YAML_EXTENSIONS,
    maxFileSizeBytes: 200_000,
  });

  const sources: DiscoverySource[] = [];
  for (const filePath of files) {
    const relativePath = toWorkspaceRelativePath(cwd, filePath);
    const nameMatches = findMatchingTerms(relativePath.toLowerCase(), terms);
    if (nameMatches.length === 0) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const contentMatches = findMatchingTerms(content.toLowerCase(), terms);
    if (contentMatches.length === 0) {
      continue;
    }

    sources.push({
      type: sourceType,
      path: relativePath,
      relevance: `Matched by name (${nameMatches.join(', ')}) and confirmed by file content (${contentMatches.join(', ')}).`,
      excerpt: buildExcerpt(content, terms),
    });
  }

  return rankSources(sources);
}

async function scanSpecSources(
  cwd: string,
  terms: readonly string[],
): Promise<DiscoverySource[]> {
  const specFiles = await collectFiles(path.join(cwd, 'openspec'), {
    allowedExtensions: ['.md'],
    maxFileSizeBytes: 200_000,
    ignoredDirs: new Set(['archive', 'node_modules', 'dist']),
  });

  const relevantFiles = specFiles.filter((filePath) => toPosixPath(filePath).includes('/specs/'));
  return scanTextFiles(cwd, relevantFiles, 'spec', terms, 6);
}

async function scanCodeSources(
  cwd: string,
  terms: readonly string[],
): Promise<DiscoverySource[]> {
  const codeFiles = await collectFiles(cwd, {
    allowedExtensions: CODE_EXTENSIONS,
    maxFileSizeBytes: 200_000,
    ignoredDirs: new Set([
      '.finalrun',
      '.git',
      '.next',
      '.turbo',
      'coverage',
      'dist',
      'frtestspec',
      'node_modules',
      'openspec',
      'tmp',
    ]),
  });

  return scanTextFiles(cwd, codeFiles, 'code', terms, 8);
}

async function scanTextFiles(
  cwd: string,
  filePaths: readonly string[],
  sourceType: 'spec' | 'code',
  terms: readonly string[],
  limit: number,
): Promise<DiscoverySource[]> {
  const sources: DiscoverySource[] = [];

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, 'utf8');
    const relativePath = toWorkspaceRelativePath(cwd, filePath);
    const nameMatches = findMatchingTerms(relativePath.toLowerCase(), terms);
    const contentMatches = findMatchingTerms(content.toLowerCase(), terms);
    if (nameMatches.length === 0 && contentMatches.length === 0) {
      continue;
    }

    const reasons: string[] = [];
    if (nameMatches.length > 0) {
      reasons.push(`name matched ${nameMatches.join(', ')}`);
    }
    if (contentMatches.length > 0) {
      reasons.push(`content matched ${contentMatches.join(', ')}`);
    }

    sources.push({
      type: sourceType,
      path: relativePath,
      relevance: reasons.join('; '),
      excerpt: buildExcerpt(content, terms),
    });
  }

  return rankSources(sources).slice(0, limit);
}

function rankSources(sources: readonly DiscoverySource[]): DiscoverySource[] {
  return [...sources].sort((left, right) => {
    const leftScore = left.relevance.length + left.excerpt.length;
    const rightScore = right.relevance.length + right.excerpt.length;
    return rightScore - leftScore;
  });
}

function findMatchingTerms(content: string, terms: readonly string[]): string[] {
  return terms.filter((term) => content.includes(term));
}

function buildExcerpt(content: string, terms: readonly string[]): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return '(empty file)';
  }

  const lines = trimmed.split('\n');
  const matchingLines = lines.filter((line) =>
    terms.some((term) => line.toLowerCase().includes(term)),
  );

  const selectedLines = matchingLines.length > 0 ? matchingLines.slice(0, 6) : lines.slice(0, 6);
  return selectedLines.join('\n').slice(0, 800);
}
