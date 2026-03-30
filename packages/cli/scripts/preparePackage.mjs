import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../..');
const cliDir = resolve(repoRoot, 'packages/cli');
const vendorRoot = resolve(cliDir, 'node_modules/@finalrun');
const cliPackageJsonPath = resolve(cliDir, 'package.json');
const cliPackageJson = JSON.parse(readFileSync(cliPackageJsonPath, 'utf8'));

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
const bundledExternalPackages = Object.keys(cliPackageJson.dependencies ?? {})
  .filter((packageName) => !packageName.startsWith('@finalrun/'));

function resolveInstalledPackagePath(packageName) {
  return resolve(repoRoot, 'node_modules', packageName);
}

function readInstalledPackageJson(packageName) {
  const packageRoot = resolveInstalledPackagePath(packageName);
  const packageJsonPath = resolve(packageRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Missing installed package.json for ${packageName}: ${packageJsonPath}`);
  }
  return JSON.parse(readFileSync(packageJsonPath, 'utf8'));
}

function collectDependencyNames(packageJson, ancestry) {
  const dependencyNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);

  for (const peerDependencyName of Object.keys(packageJson.peerDependencies ?? {})) {
    if (ancestry.has(peerDependencyName)) {
      continue;
    }
    if (existsSync(resolveInstalledPackagePath(peerDependencyName))) {
      dependencyNames.add(peerDependencyName);
    }
  }

  return [...dependencyNames].filter((packageName) => !packageName.startsWith('@finalrun/'));
}

function vendorExternalPackage(packageName, targetNodeModulesDir, ancestry = new Set()) {
  if (ancestry.has(packageName)) {
    return;
  }

  const sourcePath = resolveInstalledPackagePath(packageName);
  const targetPath = resolve(targetNodeModulesDir, packageName);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing bundled external package: ${sourcePath}`);
  }

  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath, { recursive: true });

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(packageName);

  const childNodeModulesDir = resolve(targetPath, 'node_modules');
  rmSync(childNodeModulesDir, { recursive: true, force: true });

  const packageJson = readInstalledPackageJson(packageName);
  for (const dependencyName of collectDependencyNames(packageJson, nextAncestry)) {
    vendorExternalPackage(dependencyName, childNodeModulesDir, nextAncestry);
  }
}

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

for (const packageName of bundledExternalPackages) {
  vendorExternalPackage(packageName, resolve(cliDir, 'node_modules'));
}

const protoSourcePath = resolve(repoRoot, 'proto/finalrun/driver.proto');
const protoTargetPath = resolve(cliDir, 'proto/finalrun/driver.proto');
mkdirSync(dirname(protoTargetPath), { recursive: true });
cpSync(protoSourcePath, protoTargetPath);

const installAssets = [
  'android/app-debug.apk',
  'android/app-debug-androidTest.apk',
  'ios/finalrun-ios.zip',
  'ios/finalrun-ios-test-Runner.zip',
];
const installResourcesRoot = resolve(cliDir, 'install-resources');
rmSync(installResourcesRoot, { recursive: true, force: true });

for (const relativeAssetPath of installAssets) {
  const sourcePath = resolve(repoRoot, 'resources', relativeAssetPath);
  const targetPath = resolve(installResourcesRoot, relativeAssetPath);

  if (!existsSync(sourcePath)) {
    throw new Error(`Missing install asset: ${sourcePath}`);
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
}

cpSync(resolve(repoRoot, 'README.md'), resolve(cliDir, 'README.md'));
cpSync(resolve(repoRoot, 'LICENSE'), resolve(cliDir, 'LICENSE'));
