import * as fs from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';
import { ensureParentDirectory, pathExists, resolveWorkspacePaths } from './workspace.js';

/**
 * The set of AI tools currently supported for managed skill generation.
 */
export const ALL_SUPPORTED_TOOLS = [
  'codex',
  'antigravity',
  'opencode',
  'claudecode',
  'cursor',
  'copilot',
] as const;

/**
 * Zod schema for a single supported AI tool.
 */
export const supportedToolSchema = z.enum(ALL_SUPPORTED_TOOLS);
export type SupportedTool = z.infer<typeof supportedToolSchema>;

/**
 * Zod schema for the installation scope of skills.
 * - 'local': Skills are installed within the repository.
 * - 'global': Skills are installed in the user's home directory.
 */
export const scopeSchema = z.enum(['local', 'global']);
export type Scope = z.infer<typeof scopeSchema>;

/**
 * Project configuration schema stored in `frtestspec/config.yaml`.
 */
export const projectConfigSchema = z.object({
  /** Configuration version (legacy). */
  version: z.literal(2),
  /** Tools to generate skills for. */
  tools: z.array(supportedToolSchema),
  /** Installation scope for the skills. */
  scope: scopeSchema,
  /** The backend command to execute frtestspec (e.g., 'npx frtestspec'). */
  command: z.string(),
}).strict();

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/**
 * Creates a default project configuration object.
 */
export function createProjectConfig(input: {
  tools: SupportedTool[];
  scope: Scope;
  command?: string;
}): ProjectConfig {
  return {
    version: 2,
    tools: input.tools,
    scope: input.scope,
    command: input.command ?? 'npx frtestspec',
  };
}

/**
 * Loads the project configuration from the workspace.
 * 
 * @throws Error if the configuration file is missing or invalid.
 */
export async function loadProjectConfig(cwd: string): Promise<ProjectConfig> {
  const { configPath } = resolveWorkspacePaths(cwd);
  if (!(await pathExists(configPath))) {
    throw new Error(
      "No finalruntestspec project config found at frtestspec/config.yaml. Run 'frtestspec init' first.",
    );
  }
  const content = await fs.readFile(configPath, 'utf8');
  const parsed = yaml.parse(content);
  return projectConfigSchema.parse(parsed);
}

/**
 * Writes the project configuration to the workspace.
 */
export async function writeProjectConfig(cwd: string, config: ProjectConfig): Promise<string> {
  const { configPath } = resolveWorkspacePaths(cwd);
  await ensureParentDirectory(configPath);
  const content = yaml.stringify(config);
  await fs.writeFile(configPath, content);
  return configPath;
}
