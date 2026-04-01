import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installBundledAssets, resolveUserAssetRoot } from './installAssets.mjs';

function createPackageRoot(version = '9.9.9') {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-install-assets-'));
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({ name: '@finalrun/finalrun-agent', version }, null, 2),
    'utf-8',
  );
  fs.mkdirSync(path.join(packageRoot, 'install-resources', 'android'), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, 'install-resources', 'ios'), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'install-resources', 'android', 'app-debug.apk'),
    'apk',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'install-resources', 'android', 'app-debug-androidTest.apk'),
    'apk-test',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'install-resources', 'ios', 'finalrun-ios.zip'),
    'ios-app-zip',
  );
  fs.writeFileSync(
    path.join(packageRoot, 'install-resources', 'ios', 'finalrun-ios-test-Runner.zip'),
    'ios-runner-zip',
  );
  return packageRoot;
}

test('installBundledAssets copies Android assets and extracts iOS apps into the user asset root', () => {
  const packageRoot = createPackageRoot('1.2.3');
  const cacheBase = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-install-cache-'));
  const extracted = [];

  try {
    const result = installBundledAssets({
      packageRoot,
      env: { ...process.env, FINALRUN_CACHE_DIR: cacheBase },
      platform: 'darwin',
      log: {
        log() {},
        warn() {},
      },
      extractIOSArchive(zipPath, targetDir) {
        extracted.push(path.basename(zipPath));
        if (zipPath.endsWith('finalrun-ios.zip')) {
          fs.mkdirSync(path.join(targetDir, 'finalrun-ios.app'), { recursive: true });
        }
        if (zipPath.endsWith('finalrun-ios-test-Runner.zip')) {
          fs.mkdirSync(path.join(targetDir, 'finalrun-ios-test-Runner.app'), {
            recursive: true,
          });
        }
        return { success: true };
      },
    });

    const targetRoot = resolveUserAssetRoot(packageRoot, { FINALRUN_CACHE_DIR: cacheBase });
    assert.equal(result.installed, true);
    assert.equal(result.targetRoot, targetRoot);
    assert.equal(
      fs.readFileSync(path.join(targetRoot, 'android', 'app-debug.apk'), 'utf-8'),
      'apk',
    );
    assert.deepEqual(extracted, ['finalrun-ios.zip', 'finalrun-ios-test-Runner.zip']);
    assert.equal(
      fs.existsSync(
        path.join(targetRoot, 'ios', 'Debug-iphonesimulator', 'finalrun-ios-test-Runner.app'),
      ),
      true,
    );
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
    fs.rmSync(cacheBase, { recursive: true, force: true });
  }
});

test('installBundledAssets no-ops when the packaged install resources are absent', () => {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'finalrun-install-assets-empty-'));

  try {
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@finalrun/finalrun-agent', version: '0.1.1' }, null, 2),
      'utf-8',
    );

    const result = installBundledAssets({
      packageRoot,
      log: {
        log() {},
        warn() {},
      },
    });

    assert.equal(result.installed, false);
    assert.equal(result.reason, 'missing-install-resources');
  } finally {
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});
