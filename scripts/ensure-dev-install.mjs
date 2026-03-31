import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const requiredPackages = ['typescript', 'tsx', 'next'];
const missingPackages = requiredPackages.filter((packageName) =>
  !fs.existsSync(path.join(repoRoot, 'node_modules', packageName, 'package.json')),
);

if (missingPackages.length === 0) {
  process.exit(0);
}

const packageList = missingPackages.join(', ');
console.error(
  [
    `Missing local workspace dependencies in ${repoRoot}.`,
    `Missing packages: ${packageList}`,
    '',
    'Run this once from the repo root:',
    `  cd ${repoRoot}`,
    '  npm ci',
    '',
    'If this is a fresh git worktree, each worktree needs its own node_modules',
    'or a symlink to a shared install before build/dev/test commands will work.',
  ].join('\n'),
);
process.exit(1);
