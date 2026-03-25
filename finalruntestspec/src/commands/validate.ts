import { Command } from 'commander';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import yaml from 'yaml';
import { loadTestPlan } from '../lib/test-plan.js';
import { pathExists, resolveChangePaths } from '../lib/workspace.js';
import { testScenarioSchema, testsuiteSchema } from '../schemas/grammar.js';

export interface ValidateCommandOptions {
  cwd?: string;
}

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
  const targetPaths = Array.from(new Set(plan.metadata.scenarios.map((scenario) => scenario.targetPath)));
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

export function registerValidateCommand(program: Command): void {
  program
    .command('validate <feature-name>')
    .description('Validate FinalRun test artifacts from .finalrun/tests and .finalrun/suites after apply or manual edits')
    .action(async (featureName: string) => {
      await runValidateCommand(featureName);
    });
}
