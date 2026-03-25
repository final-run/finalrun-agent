import { Command } from 'commander';
import chalk from 'chalk';
import { loadProjectConfig } from '../lib/project-config.js';
import { writeManagedSkills } from '../lib/skills.js';

export interface UpdateCommandOptions {
  cwd?: string;
}

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

export function registerUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Regenerate managed frtestspec skills from frtestspec/config.yaml')
    .action(async () => {
      await runUpdateCommand();
    });
}
