import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import { z } from 'zod';
import { buildPlanningDiscoveryContext } from '../lib/discovery.js';
import {
  buildCapabilities,
  buildImpactFromScenarios,
  createDefaultTargetPath,
  inferDefaultTargetPath,
  normalizeRequestedOutputs,
  normalizeTargetPath,
  outputTypeSchema,
  planScenarioSchema,
  renderTestPlanDocument,
  testPlanFrontmatterSchema,
  type OutputType,
  type PlanScenario,
} from '../lib/test-plan.js';
import {
  ensureDirectory,
  pathExists,
  resolveChangePaths,
  slugify,
  uniqueStrings,
} from '../lib/workspace.js';

const planDraftSchema = z.object({
  why: z.string().min(1),
  whatChanges: z.array(z.string()).min(1),
  existingCoverageSummary: z.array(z.string()).default([]),
  scenarios: z.array(z.object({
    title: z.string().min(1),
    category: z.string().min(1),
    outputType: outputTypeSchema,
    action: z.enum(['update', 'create']),
    targetPath: z.string().default(''),
    reason: z.string().min(1),
  }).strict()).min(1),
}).strict();

/**
 * Options for the plan command.
 */
export interface PlanCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** The natural language request for what to test. */
  request?: string;
  /** Comma-separated output types: 'tests' or 'suites'. */
  output?: string;
  /** Additional files to include as planning context. */
  contextFile?: string[];
}

/**
 * Runs the planning command to create a new testing campaign.
 * 
 * This command performs workspace discovery, identifies relevant sources and existing coverage,
 * and generates a structured `test-plan.md` artifact with proposed test scenarios.
 * 
 * @param featureName - The name of the feature or campaign to plan.
 * @param options - Configuration options for the command.
 * @returns The path to the generated test plan.
 * @throws Error if the campaign already exists.
 */
export async function runPlanCommand(
  featureName: string,
  options: PlanCommandOptions = {},
): Promise<{ planPath: string }> {
  console.log(chalk.blue(`Planning testing campaign for '${featureName}'...`));

  const cwd = options.cwd ?? process.cwd();
  const { changeDir, planPath } = resolveChangePaths(cwd, featureName);
  
  if (await pathExists(changeDir)) {
    throw new Error(`Testing campaign '${featureName}' already exists.`);
  }

  const request = options.request?.trim().length
    ? options.request.trim()
    : `Create or update test coverage for ${featureName}.`;
  
  const requestedOutputs = normalizeRequestedOutputs(options.output);
  
  const discovery = await buildPlanningDiscoveryContext({
    cwd,
    featureName,
    request,
    requestedOutputs,
    contextFiles: options.contextFile,
  });

  const scenarios = sanitizeScenarios({
    cwd,
    featureName,
    requestedOutputs,
    existingCoverage: discovery.existingCoverage,
    draftScenarios: [], // Planning now starts with an empty scenario list for the agent to fill
  });

  const impact = buildImpactFromScenarios(scenarios);
  const metadata = testPlanFrontmatterSchema.parse({
    featureName,
    request,
    requestedOutputs,
    approval: {
      status: 'draft',
      approvedAt: null,
    },
    sources: discovery.sources.map(({ type, path: sourcePath, relevance }) => ({
      type,
      path: sourcePath,
      relevance,
    })),
    existingCoverage: discovery.existingCoverage,
    impact,
    scenarios,
  });

  const document = renderTestPlanDocument(metadata, {
    title: `Test Plan: ${featureName}`,
    why: '<!-- Describe WHY this test plan is needed and what it accomplishes -->',
    whatChanges: ['<!-- List the high-level functional changes that require testing -->'],
    capabilities: buildCapabilities(requestedOutputs),
  });


  await ensureDirectory(changeDir);
  await fs.writeFile(planPath, document);

  console.log(chalk.green(`✓ Created test plan template at frtestspec/changes/${featureName}/`));
  console.log(chalk.yellow('\n📝 Next Steps:'));
  console.log(`1. Populate the \`scenarios\` list inside \`test-plan.md\`.`);
  console.log(`2. Mark the plan approved by setting \`Current status: approved\` in the Status section.`);
  console.log(`3. Run \`frtestspec apply ${featureName}\`.`);

  return { planPath };
}

/**
 * Registers the plan command with the main program.
 * 
 * @param program - The Commander program instance.
 */
export function registerPlanCommand(program: Command): void {
  program
    .command('plan <feature-name> [request...]')
    .description('Generate a planning-only test campaign and draft a structured test plan')
    .option('-o, --output <types>', 'Comma-separated outputs to plan: tests, suites', 'tests')
    .option('--context-file <paths...>', 'Additional files to inspect while building the test plan')
    .action(async (
      featureName: string,
      requestTokens: string[],
      command: { output?: string; contextFile?: string[] },
    ) => {
      try {
        await runPlanCommand(featureName, {
          request: requestTokens.join(' ').trim(),
          output: command.output,
          contextFile: command.contextFile,
        });
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}


/**
 * Sanitizes and normalizes the proposed test scenarios.
 * 
 * Ensures that all scenarios have valid output types, unique paths, 
 * and correctly identify whether they are updating existing files or creating new ones.
 */
function sanitizeScenarios(input: {
  cwd: string;
  featureName: string;
  requestedOutputs: readonly OutputType[];
  existingCoverage: {
    tests: string[];
    suites: string[];
  };
  draftScenarios: z.infer<typeof planDraftSchema>['scenarios'];
}): PlanScenario[] {
  const usedPaths = new Set<string>();
  const scenarios: PlanScenario[] = [];

  for (const rawScenario of input.draftScenarios) {
    if (!input.requestedOutputs.includes(rawScenario.outputType)) {
      continue;
    }

    const existingPaths = rawScenario.outputType === 'tests'
      ? input.existingCoverage.tests
      : input.existingCoverage.suites;
    
    const defaultTargetDecision = inferDefaultTargetPath({
      featureName: input.featureName,
      scenarioTitle: rawScenario.title,
      outputType: rawScenario.outputType,
      existingTestPaths: rawScenario.outputType === 'tests' ? input.existingCoverage.tests : [],
    });

    let action = rawScenario.action;
    let reason = rawScenario.reason;
    let targetPath = normalizeTargetPath(
      input.cwd,
      rawScenario.targetPath,
      input.featureName,
      rawScenario.title,
      rawScenario.outputType,
      {
        existingTestPaths: rawScenario.outputType === 'tests' ? input.existingCoverage.tests : [],
      },
    );

    if (action === 'update') {
      const matchedExistingPath = matchExistingPath(targetPath, existingPaths);
      if (matchedExistingPath) {
        targetPath = matchedExistingPath;
      } else {
        action = 'create';
        targetPath = defaultTargetDecision.targetPath;
        reason = appendPlanningNote(
          reason,
          defaultTargetDecision.note ?? 'Requested update target did not match existing coverage, so a new file path was proposed.',
        );
      }
    } else if (targetPath === defaultTargetDecision.targetPath) {
      reason = appendPlanningNote(reason, defaultTargetDecision.note);
    }

    if (action === 'create') {
      targetPath = ensureUniquePath(targetPath, usedPaths);
    }

    const scenario = planScenarioSchema.parse({
      id: slugify(rawScenario.title) || slugify(`${input.featureName}-${rawScenario.outputType}`),
      title: rawScenario.title,
      category: rawScenario.category,
      outputType: rawScenario.outputType,
      action,
      targetPath,
      reason,
    });

    usedPaths.add(scenario.targetPath);
    scenarios.push(scenario);
  }

  // Add mandatory fallback scenarios if no explicit scenarios matched the requested outputs
  for (const requestedOutput of input.requestedOutputs) {
    if (scenarios.some((scenario) => scenario.outputType === requestedOutput)) {
      continue;
    }

    const existingPaths = requestedOutput === 'tests'
      ? input.existingCoverage.tests
      : input.existingCoverage.suites;
    
    const fallbackTarget = existingPaths.length === 1
      ? existingPaths[0]
      : createDefaultTargetPath(
        input.featureName,
        requestedOutput === 'tests' ? 'coverage' : 'suite',
        requestedOutput,
        {
          existingTestPaths: requestedOutput === 'tests' ? input.existingCoverage.tests : [],
        },
      );
    
    const fallbackDecision = requestedOutput === 'tests'
      ? inferDefaultTargetPath({
        featureName: input.featureName,
        scenarioTitle: 'coverage',
        outputType: requestedOutput,
        existingTestPaths: input.existingCoverage.tests,
      })
      : null;

    scenarios.push(planScenarioSchema.parse({
      id: slugify(`${input.featureName}-${requestedOutput}`),
      title: requestedOutput === 'tests'
        ? `${input.featureName} coverage`
        : `${input.featureName} suite`,
      category: requestedOutput === 'tests' ? 'general' : 'suites',
      outputType: requestedOutput,
      action: existingPaths.length === 1 ? 'update' : 'create',
      targetPath: existingPaths.length === 1 ? existingPaths[0] : ensureUniquePath(fallbackTarget, usedPaths),
      reason: requestedOutput === 'tests'
        ? appendPlanningNote(
          'Fallback scenario created because no explicit test artifact was returned.',
          fallbackDecision?.note ?? null,
        )
        : 'Fallback suites artifact created because no explicit suite artifact was returned.',
    }));
  }

  return scenarios;
}

/**
 * Matches a proposed target path against existing coverage.
 */
function matchExistingPath(targetPath: string, existingPaths: readonly string[]): string | null {
  if (existingPaths.includes(targetPath)) {
    return targetPath;
  }

  const targetBasename = path.basename(targetPath).toLowerCase();
  const basenameMatch = existingPaths.find((candidatePath) =>
    path.basename(candidatePath).toLowerCase() === targetBasename,
  );
  if (basenameMatch) {
    return basenameMatch;
  }

  if (existingPaths.length === 1) {
    return existingPaths[0];
  }

  return null;
}

/**
 * Ensures a generated path is unique within the plan.
 */
function ensureUniquePath(targetPath: string, usedPaths: ReadonlySet<string>): string {
  if (!usedPaths.has(targetPath)) {
    return targetPath;
  }

  const extension = path.extname(targetPath);
  const base = targetPath.slice(0, extension.length === 0 ? undefined : -extension.length);
  let index = 2;
  let nextPath = `${base}-${index}${extension}`;
  while (usedPaths.has(nextPath)) {
    index += 1;
    nextPath = `${base}-${index}${extension}`;
  }
  return nextPath;
}


/**
 * Appends a secondary note to a scenario reason if provided.
 */
function appendPlanningNote(baseReason: string, note: string | null): string {
  if (!note || baseReason.includes(note)) {
    return baseReason;
  }

  return `${baseReason} ${note}`;
}
