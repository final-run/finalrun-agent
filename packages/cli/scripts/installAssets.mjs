import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPackageVersion(packageRoot) {
  const packageJsonPath = resolve(packageRoot, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version ?? '0.0.0';
}

export function resolveInstallResourceRoot(packageRoot) {
  return resolve(packageRoot, 'install-resources');
}

export function resolveUserAssetRoot(packageRoot, env = process.env) {
  const version = readPackageVersion(packageRoot);
  const overrideRoot = env['FINALRUN_CACHE_DIR'];
  if (overrideRoot && overrideRoot.trim()) {
    return resolve(overrideRoot, version);
  }
  return join(os.homedir(), '.finalrun', 'assets', version);
}

function copyFileIfPresent(sourcePath, targetPath) {
  if (!existsSync(sourcePath)) {
    return false;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  cpSync(sourcePath, targetPath);
  return true;
}

function extractIOSArchive(zipPath, targetDir) {
  const unzip = spawnSync('unzip', ['-o', zipPath, '-d', targetDir], {
    stdio: 'pipe',
    encoding: 'utf-8',
  });

  if (unzip.status !== 0) {
    const stderr = unzip.stderr?.trim();
    return {
      success: false,
      message: stderr || `unzip exited with status ${unzip.status ?? 'unknown'}`,
    };
  }

  return { success: true };
}

export function installBundledAssets(options = {}) {
  const packageRoot = options.packageRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const log = options.log ?? console;
  const platform = options.platform ?? process.platform;
  const extractIOSArchiveFn = options.extractIOSArchive ?? extractIOSArchive;
  const resourceRoot = resolveInstallResourceRoot(packageRoot);
  if (!existsSync(resourceRoot)) {
    return {
      installed: false,
      targetRoot: resolveUserAssetRoot(packageRoot, options.env),
      reason: 'missing-install-resources',
    };
  }

  const targetRoot = resolveUserAssetRoot(packageRoot, options.env);
  const copied = [];

  const androidAssets = [
    'android/app-debug.apk',
    'android/app-debug-androidTest.apk',
  ];
  for (const relativeAssetPath of androidAssets) {
    const copiedAsset = copyFileIfPresent(
      resolve(resourceRoot, relativeAssetPath),
      resolve(targetRoot, relativeAssetPath),
    );
    if (copiedAsset) {
      copied.push(relativeAssetPath);
    }
  }

  const iosAssets = [
    'ios/finalrun-ios.zip',
    'ios/finalrun-ios-test-Runner.zip',
  ];
  const copiedIOSZipPaths = [];
  for (const relativeAssetPath of iosAssets) {
    const sourcePath = resolve(resourceRoot, relativeAssetPath);
    const targetPath = resolve(targetRoot, relativeAssetPath);
    const copiedAsset = copyFileIfPresent(sourcePath, targetPath);
    if (copiedAsset) {
      copied.push(relativeAssetPath);
      copiedIOSZipPaths.push(targetPath);
    }
  }

  let extractedIOS = false;
  if (copiedIOSZipPaths.length > 0 && platform === 'darwin') {
    const targetDir = resolve(targetRoot, 'ios', 'Debug-iphonesimulator');
    mkdirSync(targetDir, { recursive: true });

    for (const zipPath of copiedIOSZipPaths) {
      const extracted = extractIOSArchiveFn(zipPath, targetDir);
      if (!extracted.success) {
        log.warn(
          `[finalrun] Failed to extract bundled iOS archive ${zipPath}: ${extracted.message}`,
        );
        return {
          installed: copied.length > 0,
          targetRoot,
          copied,
          extractedIOS,
          reason: 'ios-extract-failed',
        };
      }
    }

    extractedIOS = true;
  }

  if (copied.length > 0) {
    log.log(`[finalrun] Installed native driver assets to ${targetRoot}`);
  }

  return {
    installed: copied.length > 0,
    targetRoot,
    copied,
    extractedIOS,
  };
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath && currentFilePath === invokedPath) {
  installBundledAssets();
}
