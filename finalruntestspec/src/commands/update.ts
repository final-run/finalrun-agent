import { Command } from 'commander';
import chalk from 'chalk';
import { loadProjectConfig } from '../lib/project-config.js';
import { writeManagedSkills } from '../lib/skills.js';

/**
 * Options for the update command.
 */
export interface UpdateCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Runs the update command to refresh managed skill files.
 * 
 * This command re-reads the project configuration and regenerates all 
 * tool-specific skill files to ensure they are up to date with the latest 
 * tool definitions and backend commands.
 * 
 * @param options - Configuration options for the command.
 * @returns An object containing the list of refreshed skill files.
 */
export async function runUpdateCommand(
  options: UpdateCommandOptions = {},
): Promise<{ skillFiles: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  console.log(chalk.blue('Refreshing managed finalruntestspec skills...'));

  const config = await loadProjectConfig(cwd);
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
    .description('Regenerate managed frtestspec skills from frtestspec/config.yaml')
    .action(async () => {
      try {
        await runUpdateCommand();
      } catch (error) {
        console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}
