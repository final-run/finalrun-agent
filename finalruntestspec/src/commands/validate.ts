import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import yaml from 'yaml';
import { loadTestPlan } from '../lib/test-plan.js';
import { pathExists, resolveChangePaths, uniqueStrings } from '../lib/workspace.js';
import { testScenarioSchema, testsuiteSchema } from '../schemas/grammar.js';

/**
 * Options for the validate command.
 */
export interface ValidateCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Runs the validation command for a specific testing campaign.
 * 
 * This command checks that all artifacts declared in the approved test plan 
 * exist on disk and follow the strict FinalRun YAML grammar.
 * 
 * @param featureName - The name of the testing campaign/feature to validate.
 * @param options - Configuration options for the command.
 * @returns An object containing the list of validated files.
 * @throws Error if there are validation failures or the plan is missing.
 */
export async function runValidateCommand(
  featureName: string,
  options: ValidateCommandOptions = {},
): Promise<{ validatedFiles: string[] }> {
  console.log(chalk.blue(`Validating applied artifacts for '${featureName}'...`));

  const cwd = options.cwd ?? process.cwd();
  const { planPath } = resolveChangePaths(cwd, featureName);
  
  if (!(await pathExists(planPath))) {
    throw new Error(`No test plan found at ${planPath}`);
  }

  const plan = await loadTestPlan(planPath);
  const targetPaths = uniqueStrings(plan.metadata.scenarios.map((scenario) => scenario.targetPath));
  
  if (targetPaths.length === 0) {
    throw new Error(`No generated artifacts are declared in ${planPath}`);
  }

  const validationErrors: string[] = [];
  const validatedFiles: string[] = [];

  for (const relativeTargetPath of targetPaths) {
    const absoluteTargetPath = path.resolve(cwd, relativeTargetPath);
    if (!(await pathExists(absoluteTargetPath))) {
      validationErrors.push(`Missing generated artifact: ${relativeTargetPath}`);
      continue;
    }

    const content = await fs.readFile(absoluteTargetPath, 'utf8');
    try {
      const parsed = yaml.parse(content);
      
      // Route validation based on directory placement
      if (relativeTargetPath.startsWith('.finalrun/tests/')) {
        const result = testScenarioSchema.safeParse(parsed);
        if (!result.success) {
          validationErrors.push(...result.error.errors.map((error) =>
            `${relativeTargetPath}: [${error.path.join('.')}] ${error.message}`,
          ));
          continue;
        }
      } else if (relativeTargetPath.startsWith('.finalrun/suites/')) {
        const result = testsuiteSchema.safeParse(parsed);
        if (!result.success) {
          validationErrors.push(...result.error.errors.map((error) =>
            `${relativeTargetPath}: [${error.path.join('.')}] ${error.message}`,
          ));
          continue;
        }

        // Deep validation for suite references
        for (const referencedTestPath of result.data.tests) {
          if (!referencedTestPath.startsWith('.finalrun/tests/')) {
            validationErrors.push(
              `${relativeTargetPath}: testsuite entries must stay inside .finalrun/tests/ (${referencedTestPath})`,
            );
            continue;
          }

          const absoluteReferencedPath = path.resolve(cwd, referencedTestPath);
          if (!(await pathExists(absoluteReferencedPath))) {
            validationErrors.push(
              `${relativeTargetPath}: referenced test file not found (${referencedTestPath})`,
            );
          }
        }
      } else {
        validationErrors.push(`Unsupported generated artifact path: ${relativeTargetPath}`);
        continue;
      }

      console.log(chalk.green(`✓ Valid: ${relativeTargetPath}`));
      validatedFiles.push(relativeTargetPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      validationErrors.push(`${relativeTargetPath}: YAML parser error: ${message}`);
    }
  }

  if (validationErrors.length > 0) {
    for (const error of validationErrors) {
      console.error(chalk.red(`❌ ${error}`));
    }
    throw new Error('There were validation errors. Review the generated workspace artifacts and try again.');
  }

  console.log(chalk.green(`\nAll approved artifacts for '${featureName}' are structurally valid.`));
  return { validatedFiles };
}

/**
 * Registers the validate command with the main program.
 * 
 * @param program - The Commander program instance.
 */
export function registerValidateCommand(program: Command): void {
  program
    .command('validate <feature-name>')
    .description('Validate FinalRun test artifacts from .finalrun/tests and .finalrun/suites after apply or manual edits')
    .action(async (featureName: string) => {
      try {
        await runValidateCommand(featureName);
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}
