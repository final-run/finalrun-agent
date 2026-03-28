import { Command } from 'commander';
import chalk from 'chalk';
import {
  createProjectConfig,
  writeProjectConfig,
} from '../lib/project-config.js';
import { writeManagedSkills } from '../lib/skills.js';
import { pathExists, resolveWorkspacePaths } from '../lib/workspace.js';
import { resolveScope, resolveTools, type ConfigCommandOptions } from './cli-utils.js';

/**
 * Options for the init command.
 */
export interface InitCommandOptions extends ConfigCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Runs the initialization command for the workspace.
 * 
 * This command sets up the FinalRun project configuration and installs 
 * managed skill files for the selected AI tools. It will fail if a 
 * configuration already exists.
 * 
 * @param options - Configuration options for the command.
 * @returns An object containing the written config path and skill files.
 * @throws Error if the project is already initialized.
 */
export async function runInitCommand(
  options: InitCommandOptions = {},
): Promise<{ configPath: string; skillFiles: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  const { configPath: existingConfigPath } = resolveWorkspacePaths(cwd);

  if (await pathExists(existingConfigPath)) {
    throw new Error(
      `Project already initialized at ${existingConfigPath}. Use 'frtestspec update' to modify orientation or refresh skills.`,
    );
  }

  const scope = await resolveScope(options);
  const tools = await resolveTools(options);

  const config = createProjectConfig({
    tools,
    scope,
    command: options.command,
  });

  console.log(chalk.blue(`Initializing finalruntestspec for ${tools.join(', ')} (${scope})...`));
  const configPath = await writeProjectConfig(cwd, config);
  console.log(chalk.green('✓ Wrote frtestspec/config.yaml'));

  const skillFiles = await writeManagedSkills(cwd, config);
  for (const skillFile of skillFiles) {
    console.log(chalk.green(`✓ Wrote ${skillFile}`));
  }

  console.log(chalk.yellow('\n📝 Next Steps:'));
  console.log(`1. Restart your IDE or refresh its project skills if they are already open.`);
  console.log('2. Ask your assistant to use `frtestspec-plan` or `frtestspec-apply`.');

  return { configPath, skillFiles };
}

/**
 * Registers the init command with the main program.
 * 
 * @param program - The Commander program instance.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize repo-local frtestspec skills for supported AI tools')
    .option('--tool <tools>', 'Comma-separated tools: codex, antigravity, opencode, claudecode, cursor, copilot, or all')
    .option('--scope <scope>', 'Install scope: local or global')
    .option('--command <command>', 'Backend frtestspec invocation to embed in generated skills')
    .action(async (command: { tool?: string; scope?: string; command?: string }) => {
      try {
        await runInitCommand({
          tool: command.tool,
          scope: command.scope,
          command: command.command,
        });
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}
