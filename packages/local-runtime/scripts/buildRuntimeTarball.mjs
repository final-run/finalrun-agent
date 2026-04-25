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
//   install-resources/           # driver APKs (always) + iOS zips (darwin only)
//   proto/finalrun/driver.proto  # gRPC schema
//   report-app/                  # Vite SPA dist for the local report server
//
// We do NOT ship node_modules: the Bun-compiled CLI binary bundles all
// JS module code (goal-executor, device-node, ai-sdk, grpc, etc.) into
// itself. The runtime tarball only carries non-JS assets that need to live
// on disk for the binary's runtime resolvers (driver APKs, the Vite SPA
// dist served by the local report server, the gRPC .proto schema).

import {
  copyFileSync,
  cpSync,
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

// 1. Copy install-resources. iOS bits only ship in darwin tarballs.
console.log('[build-runtime] Copying install-resources...');
const installResourcesSource = resolve(repoRoot, 'resources');
const installResourcesTarget = resolve(stagingDir, 'install-resources');
mkdirSync(installResourcesTarget, { recursive: true });
const androidAssets = ['android/app-debug.apk', 'android/app-debug-androidTest.apk'];
const iosAssets = ['ios/finalrun-ios.zip', 'ios/finalrun-ios-test-Runner.zip'];
const assetsToCopy = [...androidAssets, ...(isDarwin ? iosAssets : [])];
// Hard-fail on any missing required asset rather than shipping a half-broken
// tarball — the install-resources files are what local commands actually
// look for at runtime, so a silent omission yields confusing
// "X driver bundle is missing" doctor output later.
const missingAssets = assetsToCopy.filter(
  (asset) => !existsSync(resolve(installResourcesSource, asset)),
);
if (missingAssets.length > 0) {
  bail(
    `Missing required runtime assets for ${target}:\n` +
    missingAssets.map((a) => `  - ${resolve(installResourcesSource, a)}`).join('\n') +
    `\nBuild driver bundles first: \`npm run build:drivers\` at the repo root.`,
  );
}
for (const asset of assetsToCopy) {
  const source = resolve(installResourcesSource, asset);
  const target = resolve(installResourcesTarget, asset);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

// 2. Copy proto.
const protoSource = resolve(repoRoot, 'proto/finalrun/driver.proto');
const protoTarget = resolve(stagingDir, 'proto/finalrun/driver.proto');
if (!existsSync(protoSource)) bail(`Missing proto at ${protoSource}`);
mkdirSync(dirname(protoTarget), { recursive: true });
copyFileSync(protoSource, protoTarget);

// 3. Copy report-app SPA.
console.log('[build-runtime] Copying report-app SPA...');
const reportAppSource = resolve(repoRoot, 'packages/report-web/dist/app');
const reportAppTarget = resolve(stagingDir, 'report-app');
if (!existsSync(reportAppSource)) {
  bail(`Missing report-web/dist/app at ${reportAppSource} — run \`npm run build --workspace=@finalrun/report-web\` first.`);
}
cpSync(reportAppSource, reportAppTarget, { recursive: true });

// 4. Compute manifest.
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

// 5. tar -czf.
console.log(`[build-runtime] Creating tarball at ${tarballPath}...`);
const tar = spawnSync(
  'tar',
  ['-czf', tarballPath, '-C', stagingDir, '.'],
  { stdio: 'inherit' },
);
if (tar.status !== 0) {
  bail(`tar exited with status ${tar.status}`);
}

// 6. Final sha256 of the tarball itself, for the install script to verify.
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
