import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { z } from 'zod';
import { loadTestPlan } from '../lib/test-plan.js';
import { runValidateCommand } from './validate.js';
import {
  ensureParentDirectory,
  pathExists,
  resolveChangePaths,
  uniqueStrings,
} from '../lib/workspace.js';

const generatedFilesSchema = z.record(z.string(), z.string());

/**
 * Options for the apply command.
 */
export interface ApplyCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Whether to show a spinner during execution. */
  useSpinner?: boolean;
}

/**
 * Runs the apply command for a specific testing campaign.
 * 
 * This command converts an approved test plan into actionable instructions 
 * for an AI agent to generate the actual FinalRun YAML files.
 * 
 * @param featureName - The name of the testing campaign/feature.
 * @param options - Configuration options for the command.
 * @returns An object containing the list of files that should be generated.
 * @throws Error if the plan is missing or not approved.
 */
export async function runApplyCommand(
  featureName: string,
  options: ApplyCommandOptions = {},
): Promise<{ files: string[]; instructions: string }> {
  const cwd = options.cwd ?? process.cwd();
  const { planPath } = resolveChangePaths(cwd, featureName);

  if (!(await pathExists(planPath))) {
    throw new Error(`No test plan found at ${planPath}`);
  }

  const plan = await loadTestPlan(planPath);
  if (plan.metadata.approval.status !== 'approved') {
    throw new Error(
      `Plan '${featureName}' is not approved. Review the plan and set 'approval.status: approved' in frtestspec/changes/${featureName}/test-plan.md first.`,
    );
  }

  const targetPaths = uniqueStrings(plan.metadata.scenarios.map((scenario) => scenario.targetPath));
  const existingFileContents = await loadExistingFileContents(cwd, plan.metadata.scenarios);
  const instructionsContent = [
    `# Instructions: Generate FinalRun Tests for '${featureName}'`,
    '',
    '## Objective',
    'Generate the approved FinalRun test and suite artifacts.',
    '',
    '## Prompt Context',
    '### System Instruction guidelines:',
    '```',
    buildApplySystemInstruction().replace(/Return a JSON object where:[\s\S]*?CORE PRINCIPLES:/, 'CORE PRINCIPLES:'),
    '```',
    '',
    '### User Prompt context:',
    '```',
    buildApplyUserPrompt({
      featureName,
      targetPaths,
      planBody: plan.body,
      metadata: plan.metadata,
      existingFileContents,
    }),
    '```',
    '',
    '## Next Steps',
    `1. Read the approved targets list and context above.`,
    `2. Generate relative YAML files for all approved \`targetPaths\`.`,
    `3. Ensure all setup flows are idempotent.`,
    `4. Validate the generated artifacts with \`frtestspec validate ${featureName}\`.`,
  ].join('\n');

  console.log(chalk.green(`✓ Apply instructions for '${featureName}':\n`));
  console.log(instructionsContent);
  console.log(chalk.yellow('\n📝 Next Steps:'));
  console.log(`1. Follow the instructions printed above to create the actual FinalRun YAML files.`);
  console.log(`2. Verify the structure with \`frtestspec validate ${featureName}\`.`);

  return { files: [], instructions: instructionsContent };
}

/**
 * Registers the apply command with the main program.
 * 
 * @param program - The Commander program instance.
 */
export function registerApplyCommand(program: Command): void {
  program
    .command('apply <feature-name>')
    .description('Apply an approved FinalRun test plan into .finalrun/tests and .finalrun/suites, then validate it')
    .action(async (featureName: string) => {
      try {
        await runApplyCommand(featureName);
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

/**
 * Builds the system instructions for the AI agent performing the apply phase.
 */
function buildApplySystemInstruction(): string {
  return `
You are an expert QA Automation Engineer. Generate FinalRun YAML artifacts with extreme precision.

Return a JSON object where:
- each key is one exact approved target path
- each value is the full YAML file content for that path

CORE PRINCIPLES:
1. **Test User-Facing Functionality Only**:
   - ✅ User interactions, gestures, and navigation (tap, swipe, scroll).
   - ✅ Form inputs and validations.
   - ❌ Do NOT test APIs, core backend processes, or third-party auth internals.
2. **Setup & Idempotent Cleanup Rule**:
   - EVERY Setup Flow MUST BE IDEMPOTENT. Clean up data from prior runs first.
   - If test validates:
     - **Adding** an item → Setup must check and **Delete** it first.
     - **Deleting** an item → Setup must check and **Add** it first.
     - **Enabling** a toggle → Setup must **Disable** first if it is on.
3. **Strict YAML Validation**:
   - Do NOT include markdown code fences (e.g., three backticks and the word yaml).
   - Use exact 2-space indentation depth.
   - Quote string values if they contain special characters (e.g., ':', '#').
   - Flat lists for lists only (no nested complex lists unless required).

Rules for test files under .finalrun/tests/:
- Use this exact YAML template shape:
  name: <snake_case_name>
  description: <One or two sentences describing what the test validates.>
  preconditions:
    - <string>
  setup:
    - <string>
  steps:
    - <string>
  assertions:
    - <string>

Rules for suite files under .finalrun/suites/:
- Use this exact YAML shape:
  name: <snake_case_name>
  description: <One or two sentences describes what the suite covers.>
  tests:
    - .finalrun/tests/<file>.yaml

Additional rules:
- Generate files only for approved target paths.
- Rewrite full file content for updates.
- Reference exact test paths under .finalrun/tests/ for suites.
`.trim();
}

/**
 * Builds the user prompt for the AI agent performing the apply phase.
 */
function buildApplyUserPrompt(input: {
  featureName: string;
  targetPaths: string[];
  planBody: string;
  metadata: Awaited<ReturnType<typeof loadTestPlan>>['metadata'];
  existingFileContents: Array<{ path: string; content: string }>;
}): string {
  return `
Feature name: ${input.featureName}

Approved plan metadata:
${JSON.stringify(input.metadata, null, 2)}

Approved plan body:
${input.planBody}

Exact target paths to generate:
${JSON.stringify(input.targetPaths, null, 2)}

Existing file contents for update targets:
${JSON.stringify(input.existingFileContents, null, 2)}
`;
}

/**
 * Loads the contents of existing files that are marked for update in the plan.
 */
async function loadExistingFileContents(
  cwd: string,
  scenarios: Awaited<ReturnType<typeof loadTestPlan>>['metadata']['scenarios'],
): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  for (const scenario of scenarios) {
    if (scenario.action !== 'update') {
      continue;
    }

    const absoluteTargetPath = path.resolve(cwd, scenario.targetPath);
    if (!(await pathExists(absoluteTargetPath))) {
      continue;
    }

    files.push({
      path: scenario.targetPath,
      content: await fs.readFile(absoluteTargetPath, 'utf8'),
    });
  }

  return files;
}

/**
 * Validates that the generator returned exactly the expected target paths.
 * 
 * @internal
 */
function validateGeneratedTargets(
  expectedPaths: readonly string[],
  actualPaths: readonly string[],
): void {
  const missingPaths = expectedPaths.filter((targetPath) => !actualPaths.includes(targetPath));
  if (missingPaths.length > 0) {
    throw new Error(`Generator did not return approved target path(s): ${missingPaths.join(', ')}`);
  }

  const extraPaths = actualPaths.filter((targetPath) => !expectedPaths.includes(targetPath));
  if (extraPaths.length > 0) {
    throw new Error(`Generator returned unexpected target path(s): ${extraPaths.join(', ')}`);
  }
}
