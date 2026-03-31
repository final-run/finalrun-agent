import { readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const cliDir = resolve(currentDir, '..');
const cliPackageJson = JSON.parse(readFileSync(resolve(cliDir, 'package.json'), 'utf8'));
const directExternalDependencies = Object.keys(cliPackageJson.dependencies ?? {})
  .filter((packageName) => !packageName.startsWith('@finalrun/'));

rmSync(resolve(cliDir, 'proto'), { recursive: true, force: true });
rmSync(resolve(cliDir, 'node_modules/@finalrun'), { recursive: true, force: true });
for (const packageName of directExternalDependencies) {
  rmSync(resolve(cliDir, 'node_modules', packageName), { recursive: true, force: true });
}
rmSync(resolve(cliDir, 'install-resources'), { recursive: true, force: true });
rmSync(resolve(cliDir, 'README.md'), { force: true });
rmSync(resolve(cliDir, 'LICENSE'), { force: true });
