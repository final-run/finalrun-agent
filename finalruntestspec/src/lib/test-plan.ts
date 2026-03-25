import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import yaml from 'yaml';
import { z } from 'zod';
import {
  ensureParentDirectory,
  slugify,
  toWorkspaceRelativePath,
  uniqueStrings,
} from './workspace.js';

/**
 * Supported output types for a testing campaign.
 */
export const outputTypeSchema = z.enum(['tests', 'testsuite']);
export type OutputType = z.infer<typeof outputTypeSchema>;

/**
 * Metadata for a single source of truth used during planning.
 */
export const planSourceSchema = z.object({
  /** Type of the source (e.g., 'spec', 'code'). */
  type: z.enum(['workspace-test', 'workspace-testsuite', 'spec', 'code', 'provided-file']),
  /** Workspace-relative path to the source file. */
  path: z.string(),
  /** Explanation of why this source is considered relevant. */
  relevance: z.string(),
}).strict();

export type PlanSource = z.infer<typeof planSourceSchema>;

/**
 * Internal schema for grouping existing workspace paths.
 */
const planPathListSchema = z.object({
  tests: z.array(z.string()),
  testsuite: z.array(z.string()),
}).strict();

/**
 * A single proposed test scenario in the plan.
 */
export const planScenarioSchema = z.object({
  /** Unique slug derived from the scenario title. */
  id: z.string(),
  /** Human-readable title of the scenario. */
  title: z.string(),
  /** Functional category (e.g., 'auth', 'checkout'). */
  category: z.string(),
  /** The type of artifact this scenario will produce. */
  outputType: outputTypeSchema,
  /** Whether this updates an existing file or creates a new one. */
  action: z.enum(['update', 'create']),
  /** The proposed workspace-relative path for the artifact. */
  targetPath: z.string(),
  /** Rationale for this scenario and its implementation strategy. */
  reason: z.string(),
}).strict();

export type PlanScenario = z.infer<typeof planScenarioSchema>;

/**
 * YAML frontmatter schema for the `test-plan.md` artifact.
 */
export const testPlanFrontmatterSchema = z.object({
  featureName: z.string(),
  request: z.string(),
  requestedOutputs: z.array(outputTypeSchema).nonempty(),
  approval: z.object({
    status: z.enum(['draft', 'approved']),
    approvedAt: z.string().nullable().optional(),
  }).strict(),
  sources: z.array(planSourceSchema),
  existingCoverage: planPathListSchema,
  impact: z.object({
    update: planPathListSchema,
    create: planPathListSchema,
  }).strict(),
  scenarios: z.array(planScenarioSchema),
}).strict();

export type TestPlanFrontmatter = z.infer<typeof testPlanFrontmatterSchema>;

/**
 * Interface for data passed to the Markdown rendering engine.
 */
export interface RenderedPlanSections {
  title: string;
  why: string;
  whatChanges: string[];
  capabilities: string[];
  impactSummary: string[];
  requestSummary: string;
  existingCoverageSummary: string[];
  requestedOutputs: OutputType[];
  proposedScenarios: PlanScenario[];
  sources: PlanSource[];
  approvalStatus: 'draft' | 'approved';
  approvedAt?: string | null;
}

/**
 * Result of parsing a `test-plan.md` file.
 */
export interface ParsedTestPlan {
  /** The YAML metadata extracted from the frontmatter. */
  metadata: TestPlanFrontmatter;
  /** The Markdown body of the plan. */
  body: string;
}

/**
 * Summary of intended changes across the workspace.
 */
export interface PlanImpact {
  update: {
    tests: string[];
    testsuite: string[];
  };
  create: {
    tests: string[];
    testsuite: string[];
  };
}

/**
 * Result of an automated path inference decision.
 */
export interface DefaultTargetPathDecision {
  /** The inferred workspace-relative path. */
  targetPath: string;
  /** Whether the path was chosen from multiple ambiguous options. */
  ambiguous: boolean;
  /** A helpful note explaining the inference logic or warnings. */
  note: string | null;
}

/** @internal */
interface FeatureFolderDecision {
  featureFolder: string;
  ambiguous: boolean;
  note: string | null;
}

/**
 * Words that are considered non-descriptive when naming test folders or files.
 * These are stripped from names to produce cleaner, more purposeful slugs.
 */
const GENERIC_FEATURE_TOKENS = new Set([
  'artifact',
  'artifacts',
  'basic',
  'campaign',
  'case',
  'cases',
  'check',
  'checks',
  'complex',
  'confirm',
  'coverage',
  'critical',
  'edge',
  'ensure',
  'existing',
  'flow',
  'flows',
  'happy',
  'main',
  'negative',
  'new',
  'path',
  'plan',
  'positive',
  'primary',
  'regression',
  'scenario',
  'scenarios',
  'secondary',
  'should',
  'simple',
  'suites',
  'suite',
  'test',
  'tests',
  'testsuite',
  'validate',
  'verify',
]);

/**
 * Builds a list of capabilities displayed in the test plan based on requested outputs.
 */
export function buildCapabilities(requestedOutputs: readonly OutputType[]): string[] {
  const capabilities = [
    'Create an approval-gated scenario plan before runnable artifact generation.',
  ];

  if (requestedOutputs.includes('tests')) {
    capabilities.push('Generate or update runnable FinalRun YAML test files under `.finalrun/tests/`.');
  }

  if (requestedOutputs.includes('testsuite')) {
    capabilities.push('Generate or update testsuite YAML files under `.finalrun/suites/`.');
  }

  return capabilities;
}

/**
 * Aggregates scenario actions into a single impact summary.
 */
export function buildImpactFromScenarios(scenarios: readonly PlanScenario[]): PlanImpact {
  const updateTests: string[] = [];
  const updateTestsuite: string[] = [];
  const createTests: string[] = [];
  const createTestsuite: string[] = [];

  for (const scenario of scenarios) {
    const bucket = scenario.action === 'update'
      ? scenario.outputType === 'tests'
        ? updateTests
        : updateTestsuite
      : scenario.outputType === 'tests'
        ? createTests
        : createTestsuite;
    bucket.push(scenario.targetPath);
  }

  return {
    update: {
      tests: uniqueStrings(updateTests),
      testsuite: uniqueStrings(updateTestsuite),
    },
    create: {
      tests: uniqueStrings(createTests),
      testsuite: uniqueStrings(createTestsuite),
    },
  };
}

/**
 * Renders a complete `test-plan.md` document from metadata and body sections.
 */
export function renderTestPlanDocument(
  metadata: TestPlanFrontmatter,
  sections: RenderedPlanSections,
): string {
  const frontmatter = yaml.stringify(metadata).trimEnd();
  const requestedOutputList = sections.requestedOutputs.map((value) => `- \`${value}\``).join('\n');
  const scenarioBlocks = sections.proposedScenarios.map((scenario, index) => [
    `### ${index + 1}. ${scenario.title}`,
    `- Category: ${scenario.category}`,
    `- Output: \`${scenario.outputType}\``,
    `- Action: \`${scenario.action}\``,
    `- Target Path: \`${scenario.targetPath}\``,
    `- Reason: ${scenario.reason}`,
  ].join('\n')).join('\n\n');

  const sourcesSection = sections.sources.length === 0
    ? '- No project sources were discovered automatically.'
    : sections.sources.map((source) =>
      `- [${source.type}] \`${source.path}\` — ${source.relevance}`,
    ).join('\n');

  const existingCoverageSection = sections.existingCoverageSummary.length === 0
    ? '- No relevant existing coverage was detected.'
    : sections.existingCoverageSummary.map((item) => `- ${item}`).join('\n');

  const impactSection = sections.impactSummary.length === 0
    ? '- No file impact has been declared yet.'
    : sections.impactSummary.map((item) => `- ${item}`).join('\n');

  const body = [
    `# ${sections.title}`,
    '',
    '## Why',
    '',
    sections.why,
    '',
    '## What Changes',
    '',
    ...sections.whatChanges.map((item) => `- ${item}`),
    '',
    '## Capabilities',
    '',
    ...sections.capabilities.map((item) => `- ${item}`),
    '',
    '## Impact',
    '',
    impactSection,
    '',
    '## Request',
    '',
    sections.requestSummary,
    '',
    '## Existing Coverage',
    '',
    existingCoverageSection,
    '',
    '## Requested Outputs',
    '',
    requestedOutputList,
    '',
    '## Proposed Scenarios',
    '',
    scenarioBlocks || '- No scenarios proposed yet.',
    '',
    '## Sources',
    '',
    sourcesSection,
    '',
    '## Approval',
    '',
    `- Current status: ${sections.approvalStatus}`,
    `- Approved at: ${sections.approvedAt ?? 'pending'}`,
    '- Review the proposed scenarios and file impact before approval.',
    '- After review, set `approval.status: approved` in the YAML frontmatter.',
    '- Optionally set `approval.approvedAt` to an ISO timestamp.',
    `- After approval, run \`frtestspec apply ${metadata.featureName}\`.`,
    '',
  ].join('\n');

  return `---\n${frontmatter}\n---\n\n${body}`;
}

/**
 * Parses a `test-plan.md` string into structured metadata and body.
 * 
 * @throws Error if frontmatter is missing or invalid.
 */
export function parseTestPlanContent(content: string): ParsedTestPlan {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error('Test plan is missing YAML frontmatter.');
  }

  const parsedFrontmatter = yaml.parse(frontmatterMatch[1]);
  const metadata = testPlanFrontmatterSchema.parse(parsedFrontmatter);
  return {
    metadata,
    body: frontmatterMatch[2].replace(/^\n/, ''),
  };
}

/**
 * Loads and parses a test plan from the filesystem.
 */
export async function loadTestPlan(planPath: string): Promise<ParsedTestPlan> {
  const content = await fs.readFile(planPath, 'utf8');
  return parseTestPlanContent(content);
}

/**
 * Writes a structured test plan back to the filesystem.
 */
export async function writeTestPlan(
  planPath: string,
  metadata: TestPlanFrontmatter,
  body: string,
): Promise<void> {
  await ensureParentDirectory(planPath);
  const frontmatter = yaml.stringify(metadata).trimEnd();
  await fs.writeFile(planPath, `---\n${frontmatter}\n---\n\n${body}`);
}

/**
 * Normalizes a requested output string (e.g., 'test, suite') into an array.
 * Defaults to `['tests']` if empty or invalid.
 */
export function normalizeRequestedOutputs(value?: string): OutputType[] {
  if (!value) {
    return ['tests'];
  }

  const normalized = value
    .split(',')
    .flatMap((entry) => entry.split(' '))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry === 'test') {
        return 'tests';
      }
      if (entry === 'suite') {
        return 'testsuite';
      }
      return entry;
    });

  const parsed = z.array(outputTypeSchema).parse(uniqueStrings(normalized));
  if (parsed.length === 0) {
    return ['tests'];
  }
  return parsed;
}

/**
 * Shorthand for inferring the default target path for a scenario.
 */
export function createDefaultTargetPath(
  featureName: string,
  scenarioTitle: string,
  outputType: OutputType,
  options: {
    existingTestPaths?: readonly string[];
  } = {},
): string {
  return inferDefaultTargetPath({
    featureName,
    scenarioTitle,
    outputType,
    existingTestPaths: options.existingTestPaths,
  }).targetPath;
}

/**
 * Infers a recommended target path for a given scenario based on its title,
 * the feature name, and existing workspace coverage.
 * 
 * Logic:
 * 1. Testsuites always go to `.finalrun/suites/<feature-name>.yaml`.
 * 2. Tests go to `.finalrun/tests/<feature-folder>/<slug>.yaml`.
 * 3. Feature folder is inferred from existing tests or the feature name.
 * 4. File slug is derived from scenario title with generic tokens stripped.
 */
export function inferDefaultTargetPath(input: {
  featureName: string;
  scenarioTitle: string;
  outputType: OutputType;
  existingTestPaths?: readonly string[];
}): DefaultTargetPathDecision {
  if (input.outputType === 'testsuite') {
    return {
      targetPath: `.finalrun/suites/${slugify(input.featureName)}.yaml`,
      ambiguous: false,
      note: null,
    };
  }

  const folderDecision = inferFeatureFolderDecision(input.featureName, input.existingTestPaths ?? []);
  const fileSlug = buildScenarioFileSlug(input.featureName, input.scenarioTitle, folderDecision.featureFolder);

  return {
    targetPath: `.finalrun/tests/${folderDecision.featureFolder}/${fileSlug}.yaml`,
    ambiguous: folderDecision.ambiguous,
    note: folderDecision.note,
  };
}

/**
 * Normalizes a raw target path from user input or AI proposal.
 * 
 * If the path is relative or outside `.finalrun`, it is converted 
 * into a standard `.finalrun` path via `createDefaultTargetPath`.
 */
export function normalizeTargetPath(
  cwd: string,
  rawTargetPath: string,
  featureName: string,
  scenarioTitle: string,
  outputType: OutputType,
  options: {
    existingTestPaths?: readonly string[];
  } = {},
): string {
  const trimmed = rawTargetPath.trim();
  if (trimmed.length === 0) {
    return createDefaultTargetPath(featureName, scenarioTitle, outputType, options);
  }

  // Already standard
  if (trimmed.startsWith('.finalrun/')) {
    return trimmed.replace(/\\/g, '/');
  }

  // Resolve relative and convert to workspace-relative
  const absolutePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(cwd, trimmed);
  const relativePath = toWorkspaceRelativePath(cwd, absolutePath);
  
  if (relativePath.startsWith('.finalrun/')) {
    return relativePath;
  }

  // If still not standard, fallback to inference
  return createDefaultTargetPath(featureName, scenarioTitle, outputType, options);
}

/**
 * Logic to decide which folder a test belongs in. 
 * Checks existing coverage for consistency or derives from the feature name.
 */
function inferFeatureFolderDecision(
  featureName: string,
  existingTestPaths: readonly string[],
): FeatureFolderDecision {
  const existingFolders = uniqueStrings(
    existingTestPaths
      .map(extractFeatureFolderFromTestPath)
      .filter((value): value is string => value !== null),
  );
  const derivedFolder = deriveFeatureFolderFromFeatureName(featureName);

  // If all existing related tests are in one folder, use that
  if (existingFolders.length === 1) {
    return {
      featureFolder: existingFolders[0],
      ambiguous: false,
      note: null,
    };
  }

  // If they span folders, pick the best guess and warn
  if (existingFolders.length > 1) {
    const fallbackFolder = derivedFolder ?? existingFolders[0];
    return {
      featureFolder: fallbackFolder,
      ambiguous: true,
      note: `Folder grouping is ambiguous because relevant tests span multiple folders (${existingFolders.join(', ')}). Review '${fallbackFolder}' before approval.`,
    };
  }

  // If no existing coverage, use the feature name (cleaned up)
  if (derivedFolder) {
    return {
      featureFolder: derivedFolder,
      ambiguous: false,
      note: null,
    };
  }

  // Last resort: kampaign slug itself or 'general'
  const fallbackFolder = slugify(featureName) || 'general';
  return {
    featureFolder: fallbackFolder,
    ambiguous: true,
    note: `Feature folder could not be confidently inferred. Defaulted to '${fallbackFolder}' from the campaign name; review before approval.`,
  };
}

/** Extracts the top-level feature folder from `.finalrun/tests/<folder>/...` */
function extractFeatureFolderFromTestPath(testPath: string): string | null {
  const match = testPath.match(/^\.finalrun\/tests\/([^/]+)\//);
  return match?.[1] ?? null;
}

/** Derives a clean folder name from feature name by stripping trailing noise. */
function deriveFeatureFolderFromFeatureName(featureName: string): string | null {
  const slug = slugify(featureName);
  if (slug.length === 0) {
    return null;
  }

  const tokens = slug.split('-').filter(Boolean);
  while (tokens.length > 1 && GENERIC_FEATURE_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }

  const candidate = tokens.join('-');
  return candidate.length > 0 ? candidate : null;
}

/** Builds an appropriate file slug for a test scenario. */
function buildScenarioFileSlug(
  featureName: string,
  scenarioTitle: string,
  featureFolder: string,
): string {
  const fullFeatureSlug = slugify(featureName);
  let scenarioSlug = slugify(scenarioTitle) || 'coverage';

  // Strip feature name or folder name from the scenario title to avoid redundancy (e.g., login-login.yaml)
  for (const prefix of uniqueStrings([fullFeatureSlug, featureFolder])) {
    if (!prefix) {
      continue;
    }

    if (scenarioSlug === prefix) {
      return 'coverage';
    }

    if (scenarioSlug.startsWith(`${prefix}-`)) {
      scenarioSlug = scenarioSlug.slice(prefix.length + 1);
    }
  }

  return stripGenericTokens(scenarioSlug) || 'coverage';
}

/** Removes non-descriptive tokens from a slug. */
function stripGenericTokens(slug: string): string {
  const tokens = slug.split('-').filter(Boolean);
  const meaningful = tokens.filter((token) => !GENERIC_FEATURE_TOKENS.has(token));
  return meaningful.join('-');
}
