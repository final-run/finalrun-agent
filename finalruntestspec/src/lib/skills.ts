import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ProjectConfig, type SupportedTool } from './project-config.js';
import { ensureParentDirectory, resolveSkillsDir, toWorkspaceRelativePath } from './workspace.js';

/**
 * Represents a skill file to be written to the filesystem.
 */
export interface SkillFile {
  /** The workspace-relative path where the skill will be written. */
  path: string;
  /** The content of the skill file (typically Markdown). */
  content: string;
}

/**
 * Renders and writes all managed skill files for the configured tools.
 * 
 * Managed skills are AI-facing instructions that provide the agent with 
 * context on how to plan and apply FinalRun tests.
 * 
 * @param cwd - The current working directory.
 * @param config - The project configuration.
 * @returns A list of paths to the written skill files.
 */
export async function writeManagedSkills(cwd: string, config: ProjectConfig): Promise<string[]> {
  const skillFiles = renderManagedSkills(cwd, config);
  const writtenPaths: string[] = [];

  for (const tool of config.tools) {
    const skillsBaseDir = resolveSkillsDir(cwd, tool, config.scope);
    await removeLegacyManagedSkills(skillsBaseDir);
  }

  for (const skill of skillFiles) {
    const absolutePath = path.resolve(cwd, skill.path);
    await ensureParentDirectory(absolutePath);
    await fs.writeFile(absolutePath, skill.content);
    writtenPaths.push(skill.path);
  }

  return writtenPaths;
}

/**
 * Removes legacy managed skill directories that are no longer supported.
 */
async function removeLegacyManagedSkills(skillsDir: string): Promise<void> {
  // Legacy names from older versions of the CLI
  const legacyDirs = ['frtestspec-propose', 'frtestspec-generate'];
  for (const dir of legacyDirs) {
    const legacyPath = path.join(skillsDir, dir);
    await fs.rm(legacyPath, { recursive: true, force: true });
  }
}

/**
 * Renders the skill definitions for each enabled tool into a list of files.
 */
function renderManagedSkills(cwd: string, config: ProjectConfig): SkillFile[] {
  const skillFiles: SkillFile[] = [];

  for (const tool of config.tools) {
    const skillsBaseDir = resolveSkillsDir(cwd, tool, config.scope);
    
    // Generate skill files for each major workflow step
    skillFiles.push(
      renderPlanSkill(cwd, skillsBaseDir, tool, config.command),
      renderApplySkill(cwd, skillsBaseDir, tool, config.command),
      renderValidateSkill(cwd, skillsBaseDir, tool, config.command),
    );
  }

  return skillFiles;
}

/**
 * Common template for a managed skill file.
 */
function renderSkillTemplate(params: {
  title: string;
  description: string;
  tool: SupportedTool;
  command: string;
  body: string;
}): string {
  return `---
name: ${params.title}
description: ${params.description}
license: Apache-2.0
compatibility: Requires the configured frtestspec CLI backend.
metadata:
  author: finalruntestspec
  managedBy: frtestspec
  tool: ${params.tool}
---

This file is managed by \`frtestspec init\`. Rerun init instead of editing it by hand.

Configured backend command:
\`\`\`bash
${params.command}
\`\`\`

${params.body}
`.trim();
}

/**
 * Renders the 'frtestspec-plan' skill.
 */
function renderPlanSkill(cwd: string, skillsBaseDir: string, tool: SupportedTool, command: string): SkillFile {
  const dirName = 'frtestspec-plan';
  const fullDir = path.join(skillsBaseDir, dirName);
  
  return {
    path: toWorkspaceRelativePath(cwd, path.join(fullDir, 'SKILL.md')),
    content: renderSkillTemplate({
      title: dirName,
      description: 'Draft a FinalRun test plan and write it to frtestspec/changes/<campaign>/test-plan.md.',
      tool,
      command,
      body: `
# frtestspec-plan

Use this skill to create a structured test plan artifact (\`test-plan.md\`) before generating any runnable test code.

## Workflow
1. Confirm the campaign name or derive a kebab-case one from the user's request.
2. Run the backend command from the repository root:
   \`\`\`bash
   ${command} plan <campaign-name> "<request>" --output tests,suites
   \`\`\`
3. Review \`frtestspec/changes/<campaign-name>/test-plan.md\`.
4. Follow the instructions to fill out the plan body and scenarios.
5. Do not apply artifacts until the plan status is set to **approved** in the **Status** section.
6. Remind the user that runnable tests are only applied later into \`.finalrun/tests/\` and \`.finalrun/suites/\`.
`.trim(),
    }),
  };
}

/**
 * Renders the 'frtestspec-apply' skill.
 */
function renderApplySkill(cwd: string, skillsBaseDir: string, tool: SupportedTool, command: string): SkillFile {
  const dirName = 'frtestspec-apply';
  const fullDir = path.join(skillsBaseDir, dirName);

  return {
    path: toWorkspaceRelativePath(cwd, path.join(fullDir, 'SKILL.md')),
    content: renderSkillTemplate({
      title: dirName,
      description: 'Apply an approved FinalRun test plan and generate YAML artifacts.',
      tool,
      command,
      body: `
# frtestspec-apply

Use this skill once a test plan has been approved to generate the actual FinalRun YAML test and suite files.

## Workflow
1. Confirm the campaign name.
2. Check \`frtestspec/changes/<campaign-name>/test-plan.md\` and make sure the **Status** section says \`Current status: approved\`.
3. Run the backend command from the repository root:
   \`\`\`bash
   ${command} apply <campaign-name>
   \`\`\`
4. Follow the instructions printed by the command to create the actual YAML artifacts under \`.finalrun/tests/\` and \`.finalrun/suites/\`.
`.trim(),
    }),
  };
}

/**
 * Renders the 'frtestspec-validate' skill.
 */
function renderValidateSkill(cwd: string, skillsBaseDir: string, tool: SupportedTool, command: string): SkillFile {
  const dirName = 'frtestspec-validate';
  const fullDir = path.join(skillsBaseDir, dirName);

  return {
    path: toWorkspaceRelativePath(cwd, path.join(fullDir, 'SKILL.md')),
    content: renderSkillTemplate({
      title: dirName,
      description: 'Validate generated FinalRun YAML artifacts against strict grammar.',
      tool,
      command,
      body: `
# frtestspec-validate

Use this skill to ensure that generated tests and suites follow the required YAML structure and naming conventions in \`.finalrun/tests/\` and \`.finalrun/suites/\`.

## Workflow
1. Confirm the campaign name.
2. Run the backend command from the repository root:
   \`\`\`bash
   ${command} validate <campaign-name>
   \`\`\`
`.trim(),
    }),
  };
}
