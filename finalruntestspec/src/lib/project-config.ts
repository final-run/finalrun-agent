import * as fs from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';
import { ensureParentDirectory, pathExists, resolveWorkspacePaths } from './workspace.js';

export const supportedToolSchema = z.enum(['codex', 'antigravity', 'opencode']);
export type SupportedTool = z.infer<typeof supportedToolSchema>;

export const ALL_SUPPORTED_TOOLS: SupportedTool[] = supportedToolSchema.options;

export const scopeSchema = z.enum(['local', 'global']);
export type Scope = z.infer<typeof scopeSchema>;

export const projectConfigSchema = z.object({
  version: z.literal(2),
  tools: z.array(supportedToolSchema).min(1),
  scope: scopeSchema,
  command: z.string().trim().min(1),
}).strict();

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export interface CreateProjectConfigInput {
  tools: SupportedTool[];
  scope: Scope;
  command?: string;
}

export function getDefaultBackendCommand(): string {
  return 'frtestspec';
}

export function createProjectConfig(input: CreateProjectConfigInput): ProjectConfig {
  return projectConfigSchema.parse({
    version: 2,
    tools: input.tools,
    scope: input.scope,
    command: input.command?.trim() || getDefaultBackendCommand(),
  });
}

export async function loadProjectConfig(cwd: string): Promise<ProjectConfig> {
  const { configPath } = resolveWorkspacePaths(cwd);
  if (!(await pathExists(configPath))) {
    throw createMissingConfigError();
  }

  const rawConfig = await fs.readFile(configPath, 'utf8');
  return projectConfigSchema.parse(yaml.parse(rawConfig));
}

export async function writeProjectConfig(cwd: string, config: ProjectConfig): Promise<string> {
  const { configPath } = resolveWorkspacePaths(cwd);
  await ensureParentDirectory(configPath);
  await fs.writeFile(configPath, yaml.stringify(config));
  return configPath;
}

function createMissingConfigError(): Error {
  return new Error(
    "No finalruntestspec project config found at frtestspec/config.yaml. Run 'frtestspec init' first.",
  );
}
