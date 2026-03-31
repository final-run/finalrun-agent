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
  load(
    envName?: string,
    options?: {
      includeDotEnv?: boolean;
      cwd?: string;
      processEnv?: NodeJS.ProcessEnv;
    },
  ): void {
    this._values.clear();
    const workingDirectory = options?.cwd ?? process.cwd();
    const processEnv = options?.processEnv ?? process.env;

    if (options?.includeDotEnv !== false && envName) {
      const envFile = path.resolve(workingDirectory, `.env.${envName}`);
      if (fs.existsSync(envFile)) {
        const parsed = dotenv.parse(fs.readFileSync(envFile, 'utf-8'));
        for (const [key, value] of Object.entries(parsed)) {
          this._values.set(key, value);
        }
      }
    }

    if (options?.includeDotEnv !== false) {
      const plainEnvFile = path.resolve(workingDirectory, '.env');
      if (fs.existsSync(plainEnvFile)) {
        const parsed = dotenv.parse(fs.readFileSync(plainEnvFile, 'utf-8'));
        for (const [key, value] of Object.entries(parsed)) {
          if (!this._values.has(key)) {
            this._values.set(key, value);
          }
        }
      }
    }

    // OS environment variables take highest precedence
    for (const [key, value] of Object.entries(processEnv)) {
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

export interface ParsedModel {
  provider: string;
  modelName: string;
}

export const SUPPORTED_AI_PROVIDERS = ['openai', 'google', 'anthropic'] as const;
export const SUPPORTED_AI_PROVIDERS_LABEL = SUPPORTED_AI_PROVIDERS.join(', ');
export const MODEL_FORMAT_EXAMPLE = 'google/gemini-3-flash-preview';
export const PROVIDER_ENV_VARS: Record<(typeof SUPPORTED_AI_PROVIDERS)[number], string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export function parseModel(modelStr: string | undefined): ParsedModel {
  const normalizedModel = modelStr?.trim();
  if (!normalizedModel) {
    throw new Error(
      `--model is required. Use provider/model, for example ${MODEL_FORMAT_EXAMPLE}. Supported providers: ${SUPPORTED_AI_PROVIDERS_LABEL}.`,
    );
  }

  const segments = normalizedModel.split('/');
  if (
    segments.length !== 2 ||
    segments[0] === undefined ||
    segments[1] === undefined ||
    segments[0].trim() === '' ||
    segments[1].trim() === ''
  ) {
    throw new Error(
      `Invalid model format: "${normalizedModel}". Expected provider/model with non-empty provider and model name. Supported providers: ${SUPPORTED_AI_PROVIDERS_LABEL}.`,
    );
  }

  const provider = segments[0].trim();
  const modelName = segments[1].trim();
  if (!SUPPORTED_AI_PROVIDERS.includes(provider as (typeof SUPPORTED_AI_PROVIDERS)[number])) {
    throw new Error(
      `Unsupported AI provider: "${provider}". Supported providers: ${SUPPORTED_AI_PROVIDERS_LABEL}.`,
    );
  }

  return {
    provider,
    modelName,
  };
}
