// Port of common/interface/FilePathUtil.dart
// Dart: abstract class FilePathUtil → TypeScript: interface FilePathUtil

/**
 * Abstract interface for resolving file paths to executables and driver apps.
 * Implemented by CliFilePathUtil in @finalrun/cli.
 *
 * Dart equivalent: common/interface/FilePathUtil.dart
 */
export interface FilePathUtil {
  // Dart: Future<String?> getADBPath()
  getADBPath(): Promise<string | null>;

  // Dart: Future<String?> getDriverAppPath()
  getDriverAppPath(): Promise<string | null>;

  // Get the Android instrumentation test APK path
  getDriverTestAppPath(): Promise<string | null>;

  // Dart: Future<String?> getIOSDriverAppPath()
  getIOSDriverAppPath(): Promise<string | null>;

  // Dart: Future<String> getAppFilePath(String appFileName)
  getAppFilePath(appFileName: string): Promise<string>;

  // Dart: Future<void> ensureIOSAppsAvailable()
  ensureIOSAppsAvailable(): Promise<void>;
}
