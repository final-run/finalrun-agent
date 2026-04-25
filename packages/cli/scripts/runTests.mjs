#!/usr/bin/env node
// Run node --test against every dist/**/*.test.js, portably across Node 20.x.
//
// We can't rely on `node --test "dist/**/*.test.js"` because native glob
// expansion in `node --test` arrived in Node 21 and we declare
// engines.node >= 20.19.

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(here, '..', 'dist');

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (entry.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

let testFiles;
try {
  testFiles = findTestFiles(distDir);
} catch (e) {
  if (e.code === 'ENOENT') {
    console.error(`[runTests] dist/ not found at ${distDir} — did you forget \`npm run build\`?`);
    process.exit(1);
  }
  throw e;
}

if (testFiles.length === 0) {
  console.error('[runTests] No *.test.js files found under dist/.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: resolve(here, '..'),
});

// Surface spawn errors instead of dropping them as a bare exit 1.
if (result.error) {
  console.error(`[runTests] Failed to spawn ${process.execPath}: ${result.error.message}`);
  process.exit(1);
}

// If node --test was killed by a signal (e.g. SIGINT, SIGKILL, OOM),
// status is null and signal carries the name. Propagate the conventional
// 128 + signo exit code so CI logs surface the real cause.
if (result.signal) {
  // The constants module exposes named signals; fall back to "1" if missing.
  const signo = (await import('node:os')).constants.signals[result.signal] ?? 1;
  process.exit(128 + signo);
}

process.exit(result.status ?? 1);
