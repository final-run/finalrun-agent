import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerApplyCommand } from './commands/apply.js';
import { registerPlanCommand } from './commands/plan.js';
import { registerUpdateCommand } from './commands/update.js';
import { registerValidateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('frtestspec')
  .description('A specialized artifact-driven CLI for generating plain-English YAML UI tests.')
  .version('1.0.0');

// Register subcommands
registerInitCommand(program);
registerPlanCommand(program);
registerApplyCommand(program);
registerUpdateCommand(program);
registerValidateCommand(program);


program.parse();
