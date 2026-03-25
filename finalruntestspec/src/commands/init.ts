import { Command } from 'commander';
import chalk from 'chalk';
import { select, checkbox } from '@inquirer/prompts';
import {
  ALL_SUPPORTED_TOOLS,
  createProjectConfig,
  loadProjectConfig,
  supportedToolSchema,
  writeProjectConfig,
  type Scope,
  type SupportedTool,
} from '../lib/project-config.js';
import { writeManagedSkills } from '../lib/skills.js';
import { pathExists, resolveWorkspacePaths } from '../lib/workspace.js';

/**
 * Options for the init command.
 */
export interface InitCommandOptions {
  /** The current working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Specific tool(s) to initialize. Can be 'all' or comma-separated names. */
  tool?: string | string[];
  /** Installation scope: 'local' (repo) or 'global' (home dir). */
  scope?: string;
  /** Custom backend command to embed in the generated skills. */
  command?: string;
}

/**
 * Runs the initialization command for the workspace.
 * 
 * This command sets up the FinalRun project configuration and installs 
 * managed skill files for the selected AI tools.
 * 
 * @param options - Configuration options for the command.
 * @returns An object containing the written config path and skill files.
 */
export async function runInitCommand(
  options: InitCommandOptions = {},
): Promise<{ configPath: string; skillFiles: string[] }> {
  const cwd = options.cwd ?? process.cwd();
  const { configPath: existingConfigPath } = resolveWorkspacePaths(cwd);
  const existingConfig = await pathExists(existingConfigPath)
    ? await loadProjectConfig(cwd).catch(() => null)
    : null;

  const scope = await resolveScope(options, existingConfig?.scope);
  const tools = await resolveTools(options, existingConfig?.tools);

  const config = createProjectConfig({
    tools,
    scope,
    command: options.command ?? existingConfig?.command,
  });

  console.log(chalk.blue(`${existingConfig ? 'Refreshing' : 'Initializing'} finalruntestspec for ${tools.join(', ')} (${scope})...`));
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
 * Resolves the installation scope, either from options, existing config, or interactive prompt.
 * 
 * @param options - Provided command options.
 * @param existingScope - Current scope from config, if any.
 * @returns The resolved scope.
 */
async function resolveScope(
  options: InitCommandOptions,
  existingScope?: Scope,
): Promise<Scope> {
  if (options.scope === 'local' || options.scope === 'global') {
    return options.scope;
  }

  if (existingScope) {
    return existingScope;
  }

  // Interactive mode
  if (process.stdin.isTTY) {
    return await select<Scope>({
      message: 'Where should skills be installed?',
      choices: [
        { name: 'Local (this repo)', value: 'local' },
        { name: 'Global (~/)', value: 'global' },
      ],
    });
  }

  return 'local';
}

/**
 * Resolves the list of tools to initialize, either from options, existing config, or interactive prompt.
 * 
 * @param options - Provided command options.
 * @param existingTools - Current list of tools from config, if any.
 * @returns The resolved list of supported tools.
 */
async function resolveTools(
  options: InitCommandOptions,
  existingTools?: SupportedTool[],
): Promise<SupportedTool[]> {
  // CLI flag: --tool codex or --tool codex,antigravity
  if (options.tool) {
    const rawTools = Array.isArray(options.tool)
      ? options.tool
      : options.tool.split(',').map((t) => t.trim());

    if (rawTools.includes('all')) {
      return [...ALL_SUPPORTED_TOOLS];
    }

    return rawTools.map((t) => supportedToolSchema.parse(t));
  }

  if (existingTools && existingTools.length > 0) {
    return existingTools;
  }

  // Interactive mode
  if (process.stdin.isTTY) {
    const selected = await checkbox<SupportedTool | 'all'>({
      message: 'Select tools:',
      choices: [
        { name: 'All', value: 'all' as const },
        ...ALL_SUPPORTED_TOOLS.map((t) => ({ name: t, value: t })),
      ],
      required: true,
    });

    if (selected.includes('all')) {
      return [...ALL_SUPPORTED_TOOLS];
    }

    return selected.filter((t): t is SupportedTool => t !== 'all');
  }

  return [...ALL_SUPPORTED_TOOLS];
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
