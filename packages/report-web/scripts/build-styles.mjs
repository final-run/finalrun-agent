// Concats the three source stylesheets into dist/ui/styles.css for consumers.
// Order matters: shared.css defines the theme tokens + resets that the page
// stylesheets reference via var(--token).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const files = [
  'src/ui/styles/shared.css',
  'src/ui/styles/run-detail.css',
  'src/ui/styles/run-index.css',
];

const outPath = path.join(root, 'dist/ui/styles.css');
await mkdir(path.dirname(outPath), { recursive: true });

const parts = [];
for (const rel of files) {
  const abs = path.join(root, rel);
  const body = await readFile(abs, 'utf8');
  parts.push(`/* === ${rel} === */`);
  parts.push(body.trim());
  parts.push('');
}

await writeFile(outPath, parts.join('\n') + '\n');
console.log(`✓ wrote ${path.relative(root, outPath)} (${parts.length} sections)`);
