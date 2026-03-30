import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../..');
const cliDir = resolve(repoRoot, 'packages/cli');
const vendorRoot = resolve(cliDir, 'node_modules/@finalrun');

const bundledPackages = [
  {
    name: '@finalrun/common',
    sourceDir: resolve(repoRoot, 'packages/common'),
    copyEntries: ['dist', 'package.json'],
  },
  {
    name: '@finalrun/device-node',
    sourceDir: resolve(repoRoot, 'packages/device-node'),
    copyEntries: ['dist', 'package.json'],
  },
  {
    name: '@finalrun/goal-executor',
    sourceDir: resolve(repoRoot, 'packages/goal-executor'),
    copyEntries: ['dist', 'package.json', 'src/prompts'],
  },
];

rmSync(vendorRoot, { recursive: true, force: true });

for (const bundledPackage of bundledPackages) {
  const targetDir = resolve(cliDir, 'node_modules', bundledPackage.name);
  mkdirSync(targetDir, { recursive: true });

  for (const entry of bundledPackage.copyEntries) {
    const sourcePath = resolve(bundledPackage.sourceDir, entry);
    const targetPath = resolve(targetDir, entry);

    if (!existsSync(sourcePath)) {
      throw new Error(`Missing bundled package entry: ${sourcePath}`);
    }

    if (entry === 'package.json') {
      const packageJson = JSON.parse(readFileSync(sourcePath, 'utf8'));
      delete packageJson.devDependencies;
      delete packageJson.scripts;
      delete packageJson.private;
      writeFileSync(targetPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
      continue;
    }

    cpSync(sourcePath, targetPath, {
      recursive: true,
      filter: (source) => !basename(source).includes('.test.'),
    });
  }
}

const protoSourcePath = resolve(repoRoot, 'proto/finalrun/driver.proto');
const protoTargetPath = resolve(cliDir, 'proto/finalrun/driver.proto');
mkdirSync(dirname(protoTargetPath), { recursive: true });
cpSync(protoSourcePath, protoTargetPath);

cpSync(resolve(repoRoot, 'README.md'), resolve(cliDir, 'README.md'));
cpSync(resolve(repoRoot, 'LICENSE'), resolve(cliDir, 'LICENSE'));
