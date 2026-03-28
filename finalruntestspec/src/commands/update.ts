import { Command } from 'commander';
import chalk from 'chalk';
import {
  createProjectConfig,
  loadProjectConfig,
  writeProjectConfig,
} from '../lib/project-config.js';
import { writeManagedSkills } from '../lib/skills.js';
import { resolveScope, resolveTools, type ConfigCommandOptions } from './cli-utils.js';

/**
 * Options for the update command.
 */
export interface UpdateCommandOptions extends ConfigCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Runs the update command to refresh configuration and managed skill files.
 * 
 * This command re-reads the project configuration, allows for updates via 
 * provided options, and regenerates all tool-specific skill files.
 * 
 * @param options - Configuration options for the command.
 * @returns An object containing the list of refreshed skill files.
 */
export async function runUpdateCommand(
  options: UpdateCommandOptions = {},
): Promise<{ skillFiles: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  
  const existingConfig = await loadProjectConfig(cwd);
  
  const hasOptions = !!(options.tool || options.scope || options.command);
  let config = existingConfig;

  if (hasOptions) {
    const scope = await resolveScope(options, existingConfig.scope);
    const tools = await resolveTools(options, existingConfig.tools);
    
    config = createProjectConfig({
      tools,
      scope,
      command: options.command ?? existingConfig.command,
    });

    if (JSON.stringify(config) !== JSON.stringify(existingConfig)) {
      console.log(chalk.blue('Updating project configuration...'));
      await writeProjectConfig(cwd, config);
      console.log(chalk.green('✓ Updated frtestspec/config.yaml'));
    }
  }

  console.log(chalk.blue('Refreshing managed finalruntestspec skills...'));
  const skillFiles = await writeManagedSkills(cwd, config);
  for (const skillFile of skillFiles) {
    console.log(chalk.green(`✓ Refreshed ${skillFile}`));
  }

  console.log(chalk.yellow(`\n📝 Next Step: Restart your IDE or refresh its project skills if the changes do not appear immediately.`));
  return { skillFiles };
}

/**
 * Registers the update command with the main program.
 * 
 * @param program - The Commander program instance.
 */
export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Regenerate managed frtestspec skills from frtestspec/config.yaml, optionally updating tools or scope')
    .option('--tool <tools>', 'Comma-separated tools: codex, antigravity, opencode, claudecode, cursor, copilot, or all')
    .option('--scope <scope>', 'Install scope: local or global')
    .option('--command <command>', 'Backend frtestspec invocation to embed in generated skills')
    .action(async (command: { tool?: string; scope?: string; command?: string }) => {
      try {
        await runUpdateCommand({
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
