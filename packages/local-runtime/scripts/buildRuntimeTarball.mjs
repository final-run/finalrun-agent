#!/usr/bin/env node
// Assemble a per-platform runtime tarball that the FinalRun CLI extracts to
// ~/.finalrun/runtime/<version>/ when local commands need their dependencies.
//
// Usage: node scripts/buildRuntimeTarball.mjs --target=<platform>
//   <platform> ∈ darwin-arm64 | darwin-x64 | linux-x64 | linux-arm64
//
// Output: packages/local-runtime/dist/finalrun-runtime-<version>-<platform>.tar.gz
//
// The tarball layout:
//   manifest.json                # version, platform, file sha256 sums
//   node_modules/                # heavy runtime npm deps (resolvable)
//   install-resources/           # driver APKs (always) + iOS zips (darwin only)
//   proto/finalrun/driver.proto  # gRPC schema
//   report-app/                  # Vite SPA dist for the local report server

import {
  copyFileSync,
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPPORTED_TARGETS = new Set([
  'darwin-arm64',
  'darwin-x64',
  'linux-x64',
  'linux-arm64',
]);

function parseArgs() {
  const targetArg = process.argv.find((a) => a.startsWith('--target='));
  if (!targetArg) {
    bail(
      'Missing --target=<platform>. Supported platforms: ' +
        [...SUPPORTED_TARGETS].join(', '),
    );
  }
  const target = targetArg.slice('--target='.length);
  if (!SUPPORTED_TARGETS.has(target)) {
    bail(
      `Unsupported target: ${target}. Supported: ` +
        [...SUPPORTED_TARGETS].join(', '),
    );
  }
  return { target };
}

function bail(message) {
  console.error(`[build-runtime] ${message}`);
  process.exit(1);
}

const { target } = parseArgs();
const isDarwin = target.startsWith('darwin');

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const cliPackageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/cli/package.json'), 'utf8'),
);
const VERSION = cliPackageJson.version;

const dist = resolve(packageRoot, 'dist');
const stagingDir = resolve(dist, `staging-${target}`);
const tarballPath = resolve(
  dist,
  `finalrun-runtime-${VERSION}-${target}.tar.gz`,
);

mkdirSync(dist, { recursive: true });
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
rmSync(tarballPath, { force: true });

// 1. Vendor runtime deps into staging/node_modules/.
//
// The local-runtime workspace's package.json lists exactly what should ship.
// Its declared deps are hoisted to repoRoot/node_modules/ by npm; we walk
// each one and copy it (along with its transitive deps) into staging.
console.log(`[build-runtime] Vendoring deps for ${target}...`);
const localRuntimePackageJson = JSON.parse(
  readFileSync(resolve(packageRoot, 'package.json'), 'utf8'),
);
const declaredDeps = Object.keys(localRuntimePackageJson.dependencies ?? {});
const stagingNodeModules = resolve(stagingDir, 'node_modules');
mkdirSync(stagingNodeModules, { recursive: true });

const finalrunPackageSources = {
  '@finalrun/cloud-core': resolve(repoRoot, 'packages/cloud-core'),
  '@finalrun/common': resolve(repoRoot, 'packages/common'),
  '@finalrun/device-node': resolve(repoRoot, 'packages/device-node'),
  '@finalrun/goal-executor': resolve(repoRoot, 'packages/goal-executor'),
  '@finalrun/report-web': resolve(repoRoot, 'packages/report-web'),
};
const finalrunPackageEntries = {
  '@finalrun/cloud-core': ['dist', 'package.json'],
  '@finalrun/common': ['dist', 'package.json'],
  '@finalrun/device-node': ['dist', 'package.json'],
  '@finalrun/goal-executor': ['dist', 'package.json', 'src/prompts'],
  '@finalrun/report-web': ['dist', 'package.json'],
};

for (const dep of declaredDeps) {
  if (dep.startsWith('@finalrun/')) {
    vendorWorkspacePackage(dep);
  } else {
    vendorExternalPackage(dep, stagingNodeModules);
  }
}

function vendorWorkspacePackage(name) {
  const source = finalrunPackageSources[name];
  if (!source) bail(`Unknown @finalrun/* package: ${name}`);
  const entries = finalrunPackageEntries[name];
  const target = resolve(stagingNodeModules, name);
  mkdirSync(target, { recursive: true });
  for (const entry of entries) {
    const sourcePath = resolve(source, entry);
    const targetPath = resolve(target, entry);
    if (!existsSync(sourcePath)) {
      bail(`Missing entry ${entry} for ${name} (build the workspace first?)`);
    }
    if (entry === 'package.json') {
      const pkg = JSON.parse(readFileSync(sourcePath, 'utf8'));
      delete pkg.devDependencies;
      delete pkg.scripts;
      delete pkg.private;
      writeFileSync(targetPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
      continue;
    }
    cpSync(sourcePath, targetPath, {
      recursive: true,
      filter: (src) => !src.endsWith('.test.js') && !src.endsWith('.test.d.ts'),
    });
  }
}

function vendorExternalPackage(packageName, targetNodeModulesDir, ancestry = new Set()) {
  if (ancestry.has(packageName)) return;
  const sourcePath = resolve(repoRoot, 'node_modules', packageName);
  const targetPath = resolve(targetNodeModulesDir, packageName);
  if (!existsSync(sourcePath)) {
    bail(`Missing hoisted dep ${packageName} at ${sourcePath} — run \`npm install\` at the repo root first.`);
  }
  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath, { recursive: true });

  const nextAncestry = new Set(ancestry);
  nextAncestry.add(packageName);

  // Strip nested node_modules from the copy so transitive deps are flat.
  const childNodeModules = resolve(targetPath, 'node_modules');
  rmSync(childNodeModules, { recursive: true, force: true });

  const childPackageJsonPath = resolve(targetPath, 'package.json');
  if (!existsSync(childPackageJsonPath)) return;
  const childPackageJson = JSON.parse(readFileSync(childPackageJsonPath, 'utf8'));
  const transitive = new Set([
    ...Object.keys(childPackageJson.dependencies ?? {}),
    ...Object.keys(childPackageJson.optionalDependencies ?? {}),
  ]);
  for (const peer of Object.keys(childPackageJson.peerDependencies ?? {})) {
    if (!nextAncestry.has(peer) && existsSync(resolve(repoRoot, 'node_modules', peer))) {
      transitive.add(peer);
    }
  }
  for (const childDep of transitive) {
    if (childDep.startsWith('@finalrun/')) continue; // handled separately
    vendorExternalPackage(childDep, targetNodeModulesDir, nextAncestry);
  }
}

// 2. Copy install-resources. iOS bits only ship in darwin tarballs.
console.log('[build-runtime] Copying install-resources...');
const installResourcesSource = resolve(repoRoot, 'resources');
const installResourcesTarget = resolve(stagingDir, 'install-resources');
mkdirSync(installResourcesTarget, { recursive: true });
const androidAssets = ['android/app-debug.apk', 'android/app-debug-androidTest.apk'];
const iosAssets = ['ios/finalrun-ios.zip', 'ios/finalrun-ios-test-Runner.zip'];
const assetsToCopy = [...androidAssets, ...(isDarwin ? iosAssets : [])];
for (const asset of assetsToCopy) {
  const source = resolve(installResourcesSource, asset);
  const target = resolve(installResourcesTarget, asset);
  if (!existsSync(source)) {
    console.warn(`[build-runtime] WARNING: missing asset ${asset} at ${source}`);
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

// 3. Copy proto.
const protoSource = resolve(repoRoot, 'proto/finalrun/driver.proto');
const protoTarget = resolve(stagingDir, 'proto/finalrun/driver.proto');
if (!existsSync(protoSource)) bail(`Missing proto at ${protoSource}`);
mkdirSync(dirname(protoTarget), { recursive: true });
copyFileSync(protoSource, protoTarget);

// 4. Copy report-app SPA.
console.log('[build-runtime] Copying report-app SPA...');
const reportAppSource = resolve(repoRoot, 'packages/report-web/dist/app');
const reportAppTarget = resolve(stagingDir, 'report-app');
if (!existsSync(reportAppSource)) {
  bail(`Missing report-web/dist/app at ${reportAppSource} — run \`npm run build --workspace=@finalrun/report-web\` first.`);
}
cpSync(reportAppSource, reportAppTarget, { recursive: true });

// 5. Compute manifest.
console.log('[build-runtime] Computing sha256 manifest...');
const manifestEntries = [];
walk(stagingDir, (filePath) => {
  const rel = relative(stagingDir, filePath).split('\\').join('/');
  if (rel === 'manifest.json') return;
  const buf = readFileSync(filePath);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  manifestEntries.push({ path: rel, sha256, size: buf.length });
});
manifestEntries.sort((a, b) => a.path.localeCompare(b.path));
const manifest = {
  version: VERSION,
  platform: target,
  generatedAt: new Date().toISOString(),
  files: manifestEntries,
};
writeFileSync(
  resolve(stagingDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
  'utf8',
);

function walk(root, fn) {
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, fn);
    else fn(full);
  }
}

// 6. tar -czf.
console.log(`[build-runtime] Creating tarball at ${tarballPath}...`);
const tar = spawnSync(
  'tar',
  ['-czf', tarballPath, '-C', stagingDir, '.'],
  { stdio: 'inherit' },
);
if (tar.status !== 0) {
  bail(`tar exited with status ${tar.status}`);
}

// 7. Final sha256 of the tarball itself, for the install script to verify.
const tarballSha = createHash('sha256').update(readFileSync(tarballPath)).digest('hex');
const tarballSize = statSync(tarballPath).size;
console.log('');
console.log(`✓ Built ${tarballPath}`);
console.log(`  size:   ${(tarballSize / (1024 * 1024)).toFixed(1)} MB`);
console.log(`  sha256: ${tarballSha}`);
console.log('');
writeFileSync(
  `${tarballPath}.sha256`,
  `${tarballSha}  ${tarballPath.split('/').pop()}\n`,
  'utf8',
);

// Leave staging dir on disk for inspection; safe to rm-rf manually.
console.log(`(staging dir kept for inspection: ${stagingDir})`);
