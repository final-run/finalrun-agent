// One-off: prefix every selector in run-index.css and run-detail.css with
// `.fr-report-ui ` so the library's CSS can't leak into host apps.
//
// Rules kept simple intentionally:
//   - Any line whose contents end with `{` and doesn't start with `@`, `:`,
//     `}` or `/*` is treated as a selector list.
//   - Each comma-separated selector in that list gets the prefix, except
//     pseudo-element declarations like `::-webkit-scrollbar` which are
//     attached to the nearest prior selector (handled naturally by
//     comma-splitting since they're on a single line).
//   - @media blocks are untouched; their inner selectors still get scoped
//     because the line-by-line scan continues inside them.
//
// Safe to re-run: the script bails if the file already contains the prefix.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PREFIX = '.fr-report-ui ';

const files = ['src/ui/styles/run-index.css', 'src/ui/styles/run-detail.css'];

for (const rel of files) {
  const abs = path.join(root, rel);
  const src = await readFile(abs, 'utf8');

  if (src.includes(PREFIX)) {
    console.log(`  (skip ${rel} — already scoped)`);
    continue;
  }

  const out = scopeCss(src);
  await writeFile(abs, out);
  console.log(`✓ scoped ${rel}`);
}

function scopeCss(src) {
  const lines = src.split('\n');
  const outLines = [];
  // Buffer selector lines until we hit the `{` that closes the selector list.
  // This handles both `selector {` on one line and multi-line comma lists.
  let selectorBuf = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (selectorBuf) {
      // Accumulating a multi-line selector list.
      selectorBuf += ' ' + trimmed;
      if (trimmed.endsWith('{')) {
        outLines.push(prefixSelectorLine(selectorBuf));
        selectorBuf = '';
      }
      continue;
    }

    // Start of an at-rule block — pass through untouched.
    if (trimmed.startsWith('@')) {
      outLines.push(line);
      continue;
    }

    // Closing brace, blank, comment, or declaration inside a rule — pass through.
    if (
      !trimmed ||
      trimmed.startsWith('}') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      !trimmed.endsWith('{') && !trimmed.endsWith(',')
    ) {
      outLines.push(line);
      continue;
    }

    // Single-line selector (`foo {`) or start of multi-line (`foo,`).
    if (trimmed.endsWith('{')) {
      outLines.push(prefixSelectorLine(trimmed));
    } else {
      // Line ends with `,` — start buffering.
      selectorBuf = trimmed;
    }
  }

  return outLines.join('\n');
}

function prefixSelectorLine(selectorLine) {
  // Strip trailing `{`, split by comma, prefix each, rejoin.
  const open = selectorLine.lastIndexOf('{');
  const selectors = selectorLine.slice(0, open).trim();
  const prefixed = selectors
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${PREFIX}${s}`)
    .join(',\n');
  return `${prefixed} {`;
}
