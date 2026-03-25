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

export const outputTypeSchema = z.enum(['tests', 'testsuite']);
export type OutputType = z.infer<typeof outputTypeSchema>;

export const planSourceSchema = z.object({
  type: z.enum(['workspace-test', 'workspace-testsuite', 'spec', 'code', 'provided-file']),
  path: z.string(),
  relevance: z.string(),
}).strict();

export type PlanSource = z.infer<typeof planSourceSchema>;

const planPathListSchema = z.object({
  tests: z.array(z.string()),
  testsuite: z.array(z.string()),
}).strict();

export const planScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  outputType: outputTypeSchema,
  action: z.enum(['update', 'create']),
  targetPath: z.string(),
  reason: z.string(),
}).strict();

export type PlanScenario = z.infer<typeof planScenarioSchema>;

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

export interface ParsedTestPlan {
  metadata: TestPlanFrontmatter;
  body: string;
}

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

export interface DefaultTargetPathDecision {
  targetPath: string;
  ambiguous: boolean;
  note: string | null;
}

interface FeatureFolderDecision {
  featureFolder: string;
  ambiguous: boolean;
  note: string | null;
}

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

export async function loadTestPlan(planPath: string): Promise<ParsedTestPlan> {
  const content = await fs.readFile(planPath, 'utf8');
  return parseTestPlanContent(content);
}

export async function writeTestPlan(
  planPath: string,
  metadata: TestPlanFrontmatter,
  body: string,
): Promise<void> {
  await ensureParentDirectory(planPath);
  const frontmatter = yaml.stringify(metadata).trimEnd();
  await fs.writeFile(planPath, `---\n${frontmatter}\n---\n\n${body}`);
}

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

  if (trimmed.startsWith('.finalrun/')) {
    return trimmed.replace(/\\/g, '/');
  }

  const absolutePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(cwd, trimmed);
  const relativePath = toWorkspaceRelativePath(cwd, absolutePath);
  if (relativePath.startsWith('.finalrun/')) {
    return relativePath;
  }

  return createDefaultTargetPath(featureName, scenarioTitle, outputType, options);
}

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

  if (existingFolders.length === 1) {
    return {
      featureFolder: existingFolders[0],
      ambiguous: false,
      note: null,
    };
  }

  if (existingFolders.length > 1) {
    const fallbackFolder = derivedFolder ?? existingFolders[0];
    return {
      featureFolder: fallbackFolder,
      ambiguous: true,
      note: `Folder grouping is ambiguous because relevant tests span multiple folders (${existingFolders.join(', ')}). Review '${fallbackFolder}' before approval.`,
    };
  }

  if (derivedFolder) {
    return {
      featureFolder: derivedFolder,
      ambiguous: false,
      note: null,
    };
  }

  const fallbackFolder = slugify(featureName) || 'general';
  return {
    featureFolder: fallbackFolder,
    ambiguous: true,
    note: `Feature folder could not be confidently inferred. Defaulted to '${fallbackFolder}' from the campaign name; review before approval.`,
  };
}

function extractFeatureFolderFromTestPath(testPath: string): string | null {
  const match = testPath.match(/^\.finalrun\/tests\/([^/]+)\//);
  return match?.[1] ?? null;
}

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

function buildScenarioFileSlug(
  featureName: string,
  scenarioTitle: string,
  featureFolder: string,
): string {
  const fullFeatureSlug = slugify(featureName);
  let scenarioSlug = slugify(scenarioTitle) || 'coverage';

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

function stripGenericTokens(slug: string): string {
  const tokens = slug.split('-').filter(Boolean);
  const meaningful = tokens.filter((token) => !GENERIC_FEATURE_TOKENS.has(token));
  return meaningful.join('-');
}
