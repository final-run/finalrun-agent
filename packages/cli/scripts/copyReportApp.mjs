// Copies the Vite-built report SPA from packages/report-web/dist/app/** into
// packages/cli/dist/report-app/. reportServer.ts resolves SPA_DIR relative
// to dist/src/ as '../report-app', so these two paths must stay aligned.
//
// If report-web's dist/app is missing we bail with a clear error — the caller
// is expected to run `npm run build --workspace=@finalrun/report-web` first.

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '..');
const source = path.resolve(cliRoot, '..', 'report-web', 'dist', 'app');
const destination = path.resolve(cliRoot, 'dist', 'report-app');

try {
  const stats = await stat(source);
  if (!stats.isDirectory()) {
    throw new Error(`${source} is not a directory`);
  }
} catch (error) {
  console.error(
    `[cli:copyReportApp] Source not found: ${source}\n` +
      `Build the report-web SPA first: npm run build:app --workspace=@finalrun/report-web`,
  );
  throw error;
}

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`[cli:copyReportApp] Copied ${path.relative(cliRoot, source)} -> ${path.relative(cliRoot, destination)}`);
