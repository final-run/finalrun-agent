import { select, checkbox } from '@inquirer/prompts';
import {
  ALL_SUPPORTED_TOOLS,
  supportedToolSchema,
  type Scope,
  type SupportedTool,
} from '../lib/project-config.js';

/**
 * Base options for commands that configure tools and scope.
 */
export interface ConfigCommandOptions {
  /** Specific tool(s) to initialize or update. Can be 'all' or comma-separated names. */
  tool?: string | string[];
  /** Installation scope: 'local' (repo) or 'global' (home dir). */
  scope?: string;
  /** Custom backend command to embed in the generated skills. */
  command?: string;
}

/**
 * Resolves the installation scope, either from options, existing config, or interactive prompt.
 * 
 * @param options - Provided command options.
 * @param existingScope - Current scope from config, if any.
 * @returns The resolved scope.
 */
export async function resolveScope(
  options: ConfigCommandOptions,
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
 * Resolves the list of tools to initialize or update, either from options, existing config, or interactive prompt.
 * 
 * @param options - Provided command options.
 * @param existingTools - Current list of tools from config, if any.
 * @returns The resolved list of supported tools.
 */
export async function resolveTools(
  options: ConfigCommandOptions,
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
