// Port of mobile_cli/lib/mobile_cli_env.dart
// Loads environment variables from .env files or OS environment.

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Environment configuration for the CLI.
 * Supports three environments: dev, prod, local.
 *
 * Dart equivalent: MobileCliEnv in mobile_cli/lib/mobile_cli_env.dart
 */
export class CliEnv {
  private _values: Map<string, string> = new Map();

  /**
   * Load environment from a .env file or process.env.
   * Dart: Future<void> loadEnv(String envName)
   */
  load(envName: string): void {
    // Try to load .env file (e.g., .env.dev, .env.prod)
    const envFile = path.resolve(process.cwd(), `.env.${envName}`);
    if (fs.existsSync(envFile)) {
      const result = dotenv.config({ path: envFile });
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          this._values.set(key, value);
        }
      }
    }

    // Also try a plain .env file
    const plainEnvFile = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(plainEnvFile)) {
      const result = dotenv.config({ path: plainEnvFile });
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          // Don't override values already set by the environment-specific file
          if (!this._values.has(key)) {
            this._values.set(key, value);
          }
        }
      }
    }

    // OS environment variables take highest precedence
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        this._values.set(key, value);
      }
    }
  }

  /** Get a value by key. */
  get(key: string): string | undefined {
    return this._values.get(key);
  }

  /** Get a required value — throws if missing. */
  getRequired(key: string): string {
    const value = this._values.get(key);
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  /** Set a value programmatically (e.g., from CLI args). */
  set(key: string, value: string): void {
    this._values.set(key, value);
  }
}
