import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import yaml from 'yaml';

import { runInitCommand } from '../dist/commands/init.js';
import { loadTestPlan } from '../dist/lib/test-plan.js';
import { loadProjectConfig } from '../dist/lib/project-config.js';
import { runApplyCommand } from '../dist/commands/apply.js';
import { runPlanCommand } from '../dist/commands/plan.js';
import { runUpdateCommand } from '../dist/commands/update.js';
import { runValidateCommand } from '../dist/commands/validate.js';
import { inferDefaultTargetPath } from '../dist/lib/test-plan.js';



test('file slug strips noise words like critical and flows from campaign name context', () => {
  const result = inferDefaultTargetPath({
    featureName: 'add-language-critical-flows',
    scenarioTitle: 'Add Second Secondary Language',
    outputType: 'tests',
    existingTestPaths: [],
  });
  const filename = result.targetPath.split('/').pop();
  assert.ok(!filename.includes('critical'), `slug should not contain "critical": ${filename}`);
  assert.ok(!filename.includes('flows'), `slug should not contain "flows": ${filename}`);
  assert.ok(!filename.includes('secondary'), `slug should not contain "secondary": ${filename}`);
  assert.ok(filename.includes('second'), `slug should contain "second": ${filename}`);
});

test('file slug falls back to coverage when all tokens are generic', () => {
  const result = inferDefaultTargetPath({
    featureName: 'test-flow',
    scenarioTitle: 'Happy Path Flow',
    outputType: 'tests',
    existingTestPaths: [],
  });
  const filename = result.targetPath.split('/').pop();
  assert.equal(filename, 'coverage.yaml', `expected coverage.yaml but got ${filename}`);
});

test('plan creates a planning-only campaign and records existing coverage', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-plan-'));
  await fs.mkdir(path.join(repoRoot, '.finalrun', 'tests', 'auth'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, '.finalrun', 'suites'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'openspec', 'specs', 'auth'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });

  await fs.writeFile(
    path.join(repoRoot, '.finalrun', 'tests', 'auth', 'login.yaml'),
    `name: login_happy_path
description: Existing login coverage
preconditions:
  - User account exists
setup:
  - App is installed
steps:
  - Tap Login
assertions:
  - Dashboard is visible
`,
  );
  await fs.writeFile(
    path.join(repoRoot, '.finalrun', 'suites', 'login-suite.yaml'),
    `name: login_suite
description: Existing login suite coverage
tests:
  - .finalrun/tests/auth/login.yaml
`,
  );
  await fs.writeFile(
    path.join(repoRoot, 'openspec', 'specs', 'auth', 'spec.md'),
    `### Requirement: Login
The app SHALL let users sign in with email and password.
`,
  );
  await fs.writeFile(
    path.join(repoRoot, 'src', 'login-screen.ts'),
    'export const loginTitle = "Login";\nexport const invalidPassword = "Invalid password";\n',
  );

  await runPlanCommand('login-flow', {
    cwd: repoRoot,
    request: 'Create coverage for email/password login and invalid password handling.',
    output: 'tests,testsuite',
  });

  const planPath = path.join(repoRoot, 'frtestspec', 'changes', 'login-flow', 'test-plan.md');
  const instructionsPath = path.join(repoRoot, 'frtestspec', 'changes', 'login-flow', 'plan-instructions.md');
  const plan = await loadTestPlan(planPath);
  const planContent = await fs.readFile(planPath, 'utf8');

  assert.ok(await exists(instructionsPath), 'plan-instructions.md should be created');
  assert.equal(await exists(path.join(repoRoot, 'frtestspec', 'changes', 'login-flow', 'ui-tests')), false);
  assert.deepEqual(plan.metadata.requestedOutputs, ['tests', 'testsuite']);
  assert.equal(plan.metadata.approval.status, 'draft');
  assert.ok(plan.metadata.existingCoverage.tests.includes('.finalrun/tests/auth/login.yaml'));
  assert.ok(plan.metadata.existingCoverage.testsuite.includes('.finalrun/suites/login-suite.yaml'));
  assert.ok(plan.metadata.sources.some((source) => source.type === 'spec'));
  assert.match(planContent, /## Why/);
  assert.match(planContent, /## What Changes/);
  assert.match(planContent, /## Capabilities/);
  assert.match(planContent, /## Impact/);
  assert.match(planContent, /## Approval/);
});

test('plan falls back to code sources when specs are missing', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-code-fallback-'));
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, 'src', 'search-screen.ts'),
    'export const searchPlaceholder = "Search Wikipedia";\nexport const emptyState = "No results";\n',
  );

  await runPlanCommand('search-flow', {
    cwd: repoRoot,
    request: 'Create search coverage for the Wikipedia search screen.',
    output: 'tests',
  });

  const plan = await loadTestPlan(path.join(repoRoot, 'frtestspec', 'changes', 'search-flow', 'test-plan.md'));
  assert.ok(plan.metadata.sources.some((source) => source.type === 'code'));
});

test('generate enforces approval and writes approved artifacts into .finalrun workspaces', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-generate-'));
  await fs.mkdir(path.join(repoRoot, '.finalrun', 'tests', 'auth'), { recursive: true });
  await fs.writeFile(
    path.join(repoRoot, '.finalrun', 'tests', 'auth', 'login.yaml'),
    `name: stale_login
description: stale
preconditions: []
setup: []
steps: []
assertions: []
`,
  );

  await runPlanCommand('login-flow', {
    cwd: repoRoot,
    request: 'Refresh login coverage and add a suite.',
    output: 'tests,testsuite',
  });

  await assert.rejects(
    () => runApplyCommand('login-flow', { cwd: repoRoot, useSpinner: false }),
    /not approved/,
  );

  await markPlanApproved(repoRoot, 'login-flow');

  const result = await runApplyCommand('login-flow', { cwd: repoRoot, useSpinner: false });
  assert.ok(typeof result.instructions === 'string' && result.instructions.length > 0, 'apply should return instructions');

  const validation = await runValidateCommand('login-flow', { cwd: repoRoot });
  assert.equal(validation.validatedFiles.length, 1);
});

test('init creates Codex skills and stores the configured backend command', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-'));
  const backendCommand = 'node /absolute/path/to/bin/frtestspec.js';

  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'codex',
    scope: 'local',
    command: backendCommand,
  });

  assert.equal(result.skillFiles.length, 3);

  const config = await loadProjectConfig(repoRoot);
  assert.deepEqual(config, {
    version: 2,
    tools: ['codex'],
    scope: 'local',
    command: backendCommand,
  });

  const planSkillPath = path.join(repoRoot, '.codex', 'skills', 'frtestspec-plan', 'SKILL.md');
  const planSkill = await fs.readFile(planSkillPath, 'utf8');
  assert.match(planSkill, /managed by `frtestspec/);
  assert.match(planSkill, /frtestspec\/changes\//);
  assert.match(planSkill, /\.finalrun\/tests\//);
  assert.match(planSkill, /\.finalrun\/suites\//);
  assert.match(planSkill, /approval\.status: approved/);
  assert.match(planSkill, new RegExp(`${escapeRegex(backendCommand)}\\s+plan`));
  assert.match(planSkill, new RegExp(escapeRegex(backendCommand)));
  assert.match(planSkill, /tool: codex/);
  assert.equal(await exists(path.join(repoRoot, '.codex', 'skills', 'frtestspec-propose', 'SKILL.md')), false);
});

test('init creates Antigravity skills under .gemini/antigravity/skills/', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-antigravity-'));
  const backendCommand = 'npx frtestspec';

  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'antigravity',
    scope: 'local',
    command: backendCommand,
  });

  assert.equal(result.skillFiles.length, 3);

  const config = await loadProjectConfig(repoRoot);
  assert.deepEqual(config, {
    version: 2,
    tools: ['antigravity'],
    scope: 'local',
    command: backendCommand,
  });

  const planSkillPath = path.join(repoRoot, '.gemini', 'antigravity', 'skills', 'frtestspec-plan', 'SKILL.md');
  const planSkill = await fs.readFile(planSkillPath, 'utf8');
  assert.match(planSkill, /tool: antigravity/);
  assert.match(planSkill, new RegExp(escapeRegex(backendCommand)));

  const applySkillPath = path.join(repoRoot, '.gemini', 'antigravity', 'skills', 'frtestspec-apply', 'SKILL.md');
  assert.ok(await exists(applySkillPath));

  // Codex dir must not be created
  assert.equal(await exists(path.join(repoRoot, '.codex')), false);
});

test('init creates OpenCode skills under .opencode/skills/', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-opencode-'));
  const backendCommand = 'npx frtestspec';

  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'opencode',
    scope: 'local',
    command: backendCommand,
  });

  assert.equal(result.skillFiles.length, 3);

  const config = await loadProjectConfig(repoRoot);
  assert.deepEqual(config, {
    version: 2,
    tools: ['opencode'],
    scope: 'local',
    command: backendCommand,
  });

  const planSkillPath = path.join(repoRoot, '.opencode', 'skills', 'frtestspec-plan', 'SKILL.md');
  const planSkill = await fs.readFile(planSkillPath, 'utf8');
  assert.match(planSkill, /tool: opencode/);
  assert.match(planSkill, new RegExp(escapeRegex(backendCommand)));

  const applySkillPath = path.join(repoRoot, '.opencode', 'skills', 'frtestspec-apply', 'SKILL.md');
  assert.ok(await exists(applySkillPath));

  // Codex dir must not be created
  assert.equal(await exists(path.join(repoRoot, '.codex')), false);
});

test('init with "all" installs skills for every supported tool', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-all-'));

  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'all',
    scope: 'local',
    command: 'frtestspec',
  });

  // 2 skills x 6 tools = 12 files
  assert.equal(result.skillFiles.length, 18);

  const config = await loadProjectConfig(repoRoot);
  assert.deepEqual(config.tools, ['codex', 'antigravity', 'opencode', 'claudecode', 'cursor', 'copilot']);

  assert.ok(await exists(path.join(repoRoot, '.codex', 'skills', 'frtestspec-plan', 'SKILL.md')));
  assert.ok(await exists(path.join(repoRoot, '.gemini', 'antigravity', 'skills', 'frtestspec-plan', 'SKILL.md')));
  assert.ok(await exists(path.join(repoRoot, '.opencode', 'skills', 'frtestspec-plan', 'SKILL.md')));
});

test('init creates Claude Code skills under .claude/skills/', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-claudecode-'));
  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'claudecode',
    scope: 'local',
  });
  assert.equal(result.skillFiles.length, 3);
  const config = await loadProjectConfig(repoRoot);
  assert.ok(config.tools.includes('claudecode'));
  assert.ok(await exists(path.join(repoRoot, '.claude', 'skills', 'frtestspec-plan', 'SKILL.md')));
});

test('init creates Cursor skills under .cursor/skills/', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-cursor-'));
  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'cursor',
    scope: 'local',
  });
  assert.equal(result.skillFiles.length, 3);
  const config = await loadProjectConfig(repoRoot);
  assert.ok(config.tools.includes('cursor'));
  assert.ok(await exists(path.join(repoRoot, '.cursor', 'skills', 'frtestspec-plan', 'SKILL.md')));
});

test('init creates Copilot skills under .github/copilot/skills/', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-init-copilot-'));
  const result = await runInitCommand({
    cwd: repoRoot,
    tool: 'copilot',
    scope: 'local',
  });
  assert.equal(result.skillFiles.length, 3);
  const config = await loadProjectConfig(repoRoot);
  assert.ok(config.tools.includes('copilot'));
  assert.ok(await exists(path.join(repoRoot, '.github', 'copilot', 'skills', 'frtestspec-plan', 'SKILL.md')));
});

test('update refreshes managed skills and requires project config', async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'frtestspec-update-'));

  await assert.rejects(
    () => runUpdateCommand({ cwd: repoRoot }),
    /Run 'frtestspec init' first/,
  );

  await runInitCommand({
    cwd: repoRoot,
    tool: 'codex',
    scope: 'local',
    command: 'frtestspec',
  });

  const legacySkillDir = path.join(repoRoot, '.codex', 'skills', 'frtestspec-propose');
  const legacySkillPath = path.join(legacySkillDir, 'SKILL.md');
  await fs.mkdir(legacySkillDir, { recursive: true });
  await fs.writeFile(legacySkillPath, 'stale skill content\n');

  const result = await runUpdateCommand({ cwd: repoRoot });
  assert.ok(result.skillFiles.includes('.codex/skills/frtestspec-plan/SKILL.md'));

  const refreshedSkill = await fs.readFile(
    path.join(repoRoot, '.codex', 'skills', 'frtestspec-plan', 'SKILL.md'),
    'utf8',
  );
  assert.match(refreshedSkill, /Configured backend command:/);
  assert.match(refreshedSkill, /frtestspec plan/);
  assert.equal(await exists(legacySkillPath), false);
});



async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function markPlanApproved(repoRoot, featureName) {
  const planPath = path.join(repoRoot, 'frtestspec', 'changes', featureName, 'test-plan.md');
  const rawPlan = await fs.readFile(planPath, 'utf8');
  const match = rawPlan.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(match, 'expected plan frontmatter');

  const metadata = yaml.parse(match[1]);
  metadata.approval = {
    status: 'approved',
    approvedAt: '2026-03-24T12:00:00.000Z',
  };
  metadata.scenarios = [
    {
      id: 'login-happy-path',
      title: 'Email/password happy path',
      category: 'happy-path',
      outputType: 'tests',
      action: 'create',
      targetPath: '.finalrun/tests/auth/login.yaml',
      reason: 'Mock scenario for testing apply instructions generation.',
    }
  ];

  const updatedBody = match[2]
    .replace(/^- Current status: .*$/m, '- Current status: approved')
    .replace(/^- Approved at: .*$/m, '- Approved at: 2026-03-24T12:00:00.000Z');

  await fs.writeFile(
    planPath,
    `---\n${yaml.stringify(metadata).trimEnd()}\n---\n\n${updatedBody.replace(/^\n/, '')}`,
  );
}



function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
