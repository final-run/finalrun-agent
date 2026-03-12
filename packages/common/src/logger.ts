// Port of common/FrLogger.dart — simplified for CLI use.
// Uses console.log/warn/error with log-level filtering.

/**
 * Log levels — matches typical severity ordering.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Simple logger replacing Dart's FrLogger.
 * Singleton pattern — call Logger.init() once, then use Logger.d/i/w/e.
 *
 * Dart equivalent: common/FrLogger.dart
 */
export class Logger {
  private static _level: LogLevel = LogLevel.INFO;
  private static _tag: string = 'finalrun';

  /** Set log level and optional tag (call once at startup). */
  static init(options?: { level?: LogLevel; tag?: string }): void {
    if (options?.level !== undefined) Logger._level = options.level;
    if (options?.tag) Logger._tag = options.tag;
  }

  /** Debug log. */
  static d(message: string, ...args: unknown[]): void {
    if (Logger._level <= LogLevel.DEBUG) {
      console.log(`[${Logger._tag}] ${message}`, ...args);
    }
  }

  /** Info log. */
  static i(message: string, ...args: unknown[]): void {
    if (Logger._level <= LogLevel.INFO) {
      console.log(`[${Logger._tag}] ${message}`, ...args);
    }
  }

  /** Warning log. */
  static w(message: string, ...args: unknown[]): void {
    if (Logger._level <= LogLevel.WARN) {
      console.warn(`[${Logger._tag}] ⚠ ${message}`, ...args);
    }
  }

  /** Error log. */
  static e(message: string, error?: unknown): void {
    if (Logger._level <= LogLevel.ERROR) {
      console.error(`[${Logger._tag}] ✖ ${message}`, error ?? '');
    }
  }
}
