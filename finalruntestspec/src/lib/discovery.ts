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

/**
 * Extensions considered for general code scanning. 
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml'];

/**
 * Extensions considered for workspace test and suite scanning.
 */
const YAML_EXTENSIONS = ['.yaml', '.yml'];

/**
 * Words filtered out from search term extraction to improve relevance.
 */
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

/**
 * A discovered source including a snippet of relevant content.
 */
export interface DiscoverySource extends PlanSource {
  /** A short snippet of the file content containing matching terms. */
  excerpt: string;
}

/**
 * Contextual information discovered during the planning phase.
 */
export interface PlanningDiscoveryContext {
  /** Relative paths to relevant existing tests and suites. */
  existingCoverage: {
    tests: string[];
    testsuite: string[];
  };
  /** All sources (test, spec, code) found that match the planning request. */
  sources: DiscoverySource[];
}

/**
 * Options for building the planning discovery context.
 */
export interface BuildPlanningDiscoveryOptions {
  /** The current working directory. */
  cwd: string;
  /** Name of the feature being planned. */
  featureName: string;
  /** The natural language request from the user. */
  request: string;
  /** The types of artifacts requested (e.g., 'tests', 'testsuite'). */
  requestedOutputs: readonly OutputType[];
  /** Optional list of specific files to include as context. */
  contextFiles?: readonly string[];
}

/**
 * Performs workspace-wide discovery to build a context for planning.
 * 
 * This scans the `.finalrun` workspace for existing coverage, searches 
 * `openspec` for requirements, and optionally scans the general codebase 
 * for implementation details that match the request.
 * 
 * @param options - Configuration for the discovery process.
 * @returns The gathered planning context.
 */
export async function buildPlanningDiscoveryContext(
  options: BuildPlanningDiscoveryOptions,
): Promise<PlanningDiscoveryContext> {
  const workspace = resolveWorkspacePaths(options.cwd);
  const terms = extractSearchTerms(options.featureName, options.request);
  
  // 1. Load explicitly provided files
  const providedSources = await loadProvidedSources(options.cwd, options.contextFiles ?? [], terms);
  
  // 2. Scan workspace for existing coverage
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

  // 3. Scan OpenSpec files for requirements
  const specSources = await scanSpecSources(options.cwd, terms);
  
  // 4. Optionally scan codebase if no specs exist or if context was explicitly provided
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

/**
 * Heuristically extracts searchable terms from a feature name and request string.
 */
function extractSearchTerms(featureName: string, request: string): string[] {
  const rawText = `${featureName} ${request}`.toLowerCase();
  const terms = rawText
    .split(/[^a-z0-9]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3 && !STOPWORDS.has(value));
  return Array.from(new Set(terms));
}

/**
 * Loads and builds excerpts for files explicitly provided by the user.
 */
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

/**
 * Scans a specific workspace directory (tests or suites) for files matching the search terms.
 */
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
    
    // For workspace files, we require at least a name match to consider it relevant
    if (nameMatches.length === 0) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const contentMatches = findMatchingTerms(content.toLowerCase(), terms);
    
    // We also confirm it by checking content for matching terms
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

/**
 * Searches for relevant Markdown specifications in the `openspec/` directory.
 */
async function scanSpecSources(
  cwd: string,
  terms: readonly string[],
): Promise<DiscoverySource[]> {
  const specFiles = await collectFiles(path.join(cwd, 'openspec'), {
    allowedExtensions: ['.md'],
    maxFileSizeBytes: 200_000,
    ignoredDirs: new Set(['archive', 'node_modules', 'dist']),
  });

  // Only consider files within an 'specs' subdirectory of openspec
  const relevantFiles = specFiles.filter((filePath) => toPosixPath(filePath).includes('/specs/'));
  return scanTextFiles(cwd, relevantFiles, 'spec', terms, 6);
}

/**
 * Searches the general codebase for implementation files matching the search terms.
 */
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

/**
 * Performs a text-based keyword search across a list of files.
 */
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

/**
 * Ranks sources based on the density of matches (relevance string length + excerpt length).
 */
function rankSources(sources: readonly DiscoverySource[]): DiscoverySource[] {
  return [...sources].sort((left, right) => {
    const leftScore = left.relevance.length + left.excerpt.length;
    const rightScore = right.relevance.length + right.excerpt.length;
    return rightScore - leftScore;
  });
}

/**
 * Returns the subset of terms that are present in the given content.
 */
function findMatchingTerms(content: string, terms: readonly string[]): string[] {
  return terms.filter((term) => content.includes(term));
}

/**
 * Extracts a multi-line snippet from content that contains at least one matching term.
 */
function buildExcerpt(content: string, terms: readonly string[]): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return '(empty file)';
  }

  const lines = trimmed.split('\n');
  const matchingLines = lines.filter((line) =>
    terms.some((term) => line.toLowerCase().includes(term)),
  );

  // Fallback to top of file if no line match
  const selectedLines = matchingLines.length > 0 ? matchingLines.slice(0, 6) : lines.slice(0, 6);
  return selectedLines.join('\n').slice(0, 800);
}
