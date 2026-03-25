import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ProjectConfig, type SupportedTool } from './project-config.js';
import { ensureParentDirectory, resolveSkillsDir, toWorkspaceRelativePath } from './workspace.js';

interface ManagedSkillDefinition {
  dirName: string;
  fileName: string;
  description: string;
  instructions: string;
}

const MANAGED_SKILLS: ManagedSkillDefinition[] = [
  {
    dirName: 'frtestspec-plan',
    fileName: 'SKILL.md',
    description: 'Draft a FinalRun test plan and write it to frtestspec/changes/<campaign>/test-plan.md.',
    instructions: `
Create or refine a FinalRun test plan from repository context.

Workflow:
1. Confirm the campaign name or derive a kebab-case one from the user's request.
2. Run the backend command from the repository root:
   \`\`\`bash
   {{command}} plan <campaign-name> "<request>" --output tests,suites
   \`\`\`
3. Review \`frtestspec/changes/<campaign-name>/test-plan.md\`.
4. Explain that planning artifacts stay under \`frtestspec/changes/\`.
5. Remind the user that runnable tests are only applied later into \`.finalrun/tests/\` and \`.finalrun/suites/\`.
6. Do not apply artifacts until the plan frontmatter sets \`approval.status: approved\`.
`.trim(),
  },
  {
    dirName: 'frtestspec-apply',
    fileName: 'SKILL.md',
    description: 'Apply an approved FinalRun test plan into .finalrun/tests/ and .finalrun/suites/ and validate it.',
    instructions: `
Apply approved FinalRun workspace artifacts for an existing campaign.

Workflow:
1. Confirm the campaign name.
2. Check \`frtestspec/changes/<campaign-name>/test-plan.md\` and make sure the frontmatter says \`approval.status: approved\`.
3. Run the backend command from the repository root:
   \`\`\`bash
   {{command}} apply <campaign-name>
   \`\`\`
4. Explain that apply both writes the approved artifacts and validates them before success.
5. Report which files were written under \`.finalrun/tests/\` and \`.finalrun/suites/\`.
6. If approval is missing, stop and tell the user to update the plan rather than applying it anyway.
`.trim(),
  },
];

export async function writeManagedSkills(
  cwd: string,
  config: ProjectConfig,
): Promise<string[]> {
  const writtenFiles: string[] = [];

  for (const tool of config.tools) {
    const skillsDir = resolveSkillsDir(cwd, tool, config.scope);
    await removeLegacyManagedSkills(skillsDir);

    for (const skill of MANAGED_SKILLS) {
      const skillPath = path.join(skillsDir, skill.dirName, skill.fileName);
      await ensureParentDirectory(skillPath);
      await fs.writeFile(skillPath, renderSkillContent(skill, config, tool));
      writtenFiles.push(toWorkspaceRelativePath(cwd, skillPath));
    }
  }

  return writtenFiles;
}

async function removeLegacyManagedSkills(skillsDir: string): Promise<void> {
  await fs.rm(path.join(skillsDir, 'frtestspec-propose'), { recursive: true, force: true });
  await fs.rm(path.join(skillsDir, 'frtestspec-generate'), { recursive: true, force: true });
  await fs.rm(path.join(skillsDir, 'frtestspec-validate'), { recursive: true, force: true });
}

function renderSkillContent(
  skill: ManagedSkillDefinition,
  config: ProjectConfig,
  tool: SupportedTool,
): string {
  const body = skill.instructions.replaceAll('{{command}}', config.command);

  return `---
name: ${skill.dirName}
description: ${skill.description}
license: MIT
compatibility: Requires the configured frtestspec CLI backend.
metadata:
  author: finalruntestspec
  managedBy: frtestspec
  tool: ${tool}
---

This file is managed by \`frtestspec init\`. Rerun init instead of editing it by hand.

Configured backend command:
\`\`\`bash
${config.command}
\`\`\`

The FinalRun planning flow keeps plan files under \`frtestspec/changes/\` and writes approved runnable artifacts to \`.finalrun/tests/\` and \`.finalrun/suites/\`.

${body}
`;
}
