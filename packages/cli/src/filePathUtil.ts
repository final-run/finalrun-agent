// Port of mobile_cli/lib/cli_file_path_util.dart
// Resolves paths to ADB, driver APKs, and iOS apps.
// Driver files are copied from studio-flutter/device_node_server/executables/

import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { FilePathUtil } from '@finalrun/common';

const execFileAsync = promisify(execFile);
type ExecFileFn = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

/**
 * CLI-specific file path resolver.
 * Locates ADB, driver app binaries, and user app files.
 *
 * Dart equivalent: CliFilePathUtil in mobile_cli/lib/cli_file_path_util.dart
 */
export class CliFilePathUtil implements FilePathUtil {
  private _resourceDir: string;
  private _execFileFn: ExecFileFn;

  constructor(resourceDir?: string, execFileFn?: ExecFileFn) {
    // __dirname = packages/cli/src/ (tsx) or packages/cli/dist/src/ (compiled)
    // We need to get to the monorepo root's 'resources/' directory.
    // Walk up until we find a directory containing 'resources/'
    this._resourceDir = resourceDir ?? this._findResourceDir();
    this._execFileFn = execFileFn ?? execFileAsync;
  }

  private _findResourceDir(): string {
    // Try multiple possible locations relative to __dirname
    const candidates = [
      path.resolve(__dirname, '../../../resources'),     // from packages/cli/src/
      path.resolve(__dirname, '../../../../resources'),  // from packages/cli/dist/src/
      path.resolve(__dirname, '../../resources'),        // fallback
      path.resolve(process.cwd(), 'resources'),          // from CWD (monorepo root)
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Default to CWD/resources even if it doesn't exist yet
    return path.resolve(process.cwd(), 'resources');
  }

  /**
   * Find ADB path: check ANDROID_HOME, then try `which adb`.
   * Dart: Future<String?> getADBPath()
   */
  async getADBPath(): Promise<string | null> {
    // Check ANDROID_HOME first
    const androidHome = process.env['ANDROID_HOME'] ?? process.env['ANDROID_SDK_ROOT'];
    if (androidHome) {
      const adbPath = path.join(androidHome, 'platform-tools', 'adb');
      if (fs.existsSync(adbPath)) {
        return adbPath;
      }
    }

    // Try `which adb`
    try {
      const { stdout } = await execFileAsync('which', ['adb']);
      const resolved = stdout.trim();
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // adb not in PATH
    }

    return null;
  }

  /**
   * Get path to the Android driver app APK (the main app).
   * File: resources/android/app-debug.apk
   */
  async getDriverAppPath(): Promise<string | null> {
    const candidates = [
      path.join(this._resourceDir, 'android', 'app-debug.apk'),
      path.join(this._resourceDir, 'app-debug.apk'),
      path.join(this._resourceDir, 'finalrun-driver.apk'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get path to the Android test runner APK (instrumentation test APK).
   * File: resources/android/app-debug-androidTest.apk
   */
  async getDriverTestAppPath(): Promise<string | null> {
    const candidates = [
      path.join(this._resourceDir, 'android', 'app-debug-androidTest.apk'),
      path.join(this._resourceDir, 'app-debug-androidTest.apk'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Get path to the extracted iOS runner app.
   * Files are extracted from resources/ios/finalrun-ios.zip and
   * resources/ios/finalrun-ios-test-Runner.zip into Debug-iphonesimulator/.
   */
  async getIOSDriverAppPath(): Promise<string | null> {
    await this.ensureIOSAppsAvailable();

    const runnerAppPath = path.join(
      this._resourceDir,
      'ios',
      'Debug-iphonesimulator',
      'finalrun-ios-test-Runner.app',
    );
    if (!fs.existsSync(runnerAppPath)) {
      throw new Error(`Extracted iOS runner app not found: ${runnerAppPath}`);
    }

    return runnerAppPath;
  }

  /**
   * Get the path to a user's app file (APK/IPA specified by name).
   */
  async getAppFilePath(appFileName: string): Promise<string> {
    // First check absolute path
    if (path.isAbsolute(appFileName) && fs.existsSync(appFileName)) {
      return appFileName;
    }

    // Check relative to CWD
    const cwdPath = path.resolve(process.cwd(), appFileName);
    if (fs.existsSync(cwdPath)) {
      return cwdPath;
    }

    throw new Error(`App file not found: ${appFileName}`);
  }

  /**
   * Ensure iOS apps are available (extract from .zip if needed).
   */
  async ensureIOSAppsAvailable(): Promise<void> {
    const iosDir = path.join(this._resourceDir, 'ios');
    const targetDir = path.join(iosDir, 'Debug-iphonesimulator');
    const appZipPath = path.join(iosDir, 'finalrun-ios.zip');
    const runnerZipPath = path.join(iosDir, 'finalrun-ios-test-Runner.zip');

    if (!fs.existsSync(appZipPath)) {
      throw new Error(`Missing iOS driver archive: ${appZipPath}`);
    }
    if (!fs.existsSync(runnerZipPath)) {
      throw new Error(`Missing iOS test runner archive: ${runnerZipPath}`);
    }

    fs.mkdirSync(targetDir, { recursive: true });

    for (const zipPath of [appZipPath, runnerZipPath]) {
      try {
        await this._execFileFn('unzip', ['-o', zipPath, '-d', targetDir]);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);
        throw new Error(`Failed to unzip iOS driver archive ${zipPath}: ${message}`);
      }
    }

    const runnerAppPath = path.join(targetDir, 'finalrun-ios-test-Runner.app');
    if (!fs.existsSync(runnerAppPath)) {
      throw new Error(`Extracted iOS runner app not found: ${runnerAppPath}`);
    }
  }
}
