import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

if (fs.existsSync(path.join(repoRoot, 'node_modules'))) {
  process.exit(0);
}

console.error(
  [
    `No node_modules in ${repoRoot}.`,
    '',
    'Run this once from the repo root:',
    `  cd ${repoRoot}`,
    '  npm ci',
    '',
    'Each git worktree needs its own node_modules (or a symlink to a shared install).',
  ].join('\n'),
);
process.exit(1);
