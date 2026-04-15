import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
  TestDefinition,
  SuiteDefinition,
  EnvironmentConfig,
  VariableValue,
  RuntimeBindings,
  SecretReference,
} from '@finalrun/common';
import { readAppConfig } from './appConfig.js';
import { sanitizeId } from './workspace.js';
import { CliEnv } from './env.js';

const ENV_TOP_LEVEL_KEYS = new Set(['app', 'secrets', 'variables']);
const TEST_TOP_LEVEL_KEYS = new Set([
  'name',
  'description',
  'steps',
  'expected_state',
]);
const SUITE_TOP_LEVEL_KEYS = new Set(['name', 'description', 'tests']);
const SECRET_PLACEHOLDER = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;
const TEST_REFERENCE_PATTERN = /\$\{(variables|secrets)\.([A-Za-z0-9_-]+)\}/g;

export interface LoadedEnvironmentConfig {
  envName: string;
  envPath?: string;
  config: EnvironmentConfig;
  bindings: RuntimeBindings;
  secretReferences: SecretReference[];
}

export async function loadEnvironmentConfig(
  envPath: string | undefined,
  envName: string,
  runtimeEnv: CliEnv,
): Promise<LoadedEnvironmentConfig> {
  if (!envPath) {
    return {
      envName,
      config: {
        app: undefined,
        secrets: {},
        variables: {},
      },
      bindings: {
        secrets: {},
        variables: {},
      },
      secretReferences: [],
    };
  }

  const raw = await fs.readFile(envPath, 'utf-8').catch(() => {
    throw new Error(`Environment file not found: ${envPath}`);
  });

  const parsed = parseYamlDocument(raw, envPath);
  assertPlainObject(parsed, `Environment file ${envPath}`);
  assertAllowedKeys(parsed, ENV_TOP_LEVEL_KEYS, `Environment file ${envPath}`);

  const secrets = readSecrets(parsed['secrets'], envPath, runtimeEnv);
  const variables = readVariables(parsed['variables'], envPath);

  return {
    envName,
    envPath,
    config: {
      app: readAppConfig(parsed['app'], `${envPath} app`),
      secrets: Object.fromEntries(
        secrets.references.map((entry) => [entry.key, `\${${entry.envVar}}`]),
      ),
      variables,
    },
    bindings: {
      secrets: secrets.bindings,
      variables,
    },
    secretReferences: secrets.references,
  };
}

export async function loadTest(
  filePath: string,
  testsDir: string,
): Promise<TestDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseYamlDocument(raw, filePath);
  assertPlainObject(parsed, `Test file ${filePath}`);
  assertAllowedKeys(parsed, TEST_TOP_LEVEL_KEYS, `Test file ${filePath}`);

  const name = readRequiredString(parsed['name'], `${filePath} name`);
  const description = readOptionalString(parsed['description'], `${filePath} description`);
  const steps = readStringArray(parsed['steps'], `${filePath} steps`);
  const expected_state = readStringArray(parsed['expected_state'], `${filePath} expected_state`);

  if (steps.length === 0) {
    throw new Error(`Test file ${filePath} must define a non-empty steps array.`);
  }

  const relativePath = path.relative(testsDir, filePath).split(path.sep).join('/');
  return {
    name,
    description,
    steps,
    expected_state,
    sourcePath: filePath,
    relativePath,
    testId: sanitizeId(relativePath),
  };
}

export async function loadTestSuite(
  filePath: string,
  suitesDir: string,
): Promise<SuiteDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseYamlDocument(raw, filePath);
  assertPlainObject(parsed, `Test suite ${filePath}`);
  assertAllowedKeys(parsed, SUITE_TOP_LEVEL_KEYS, `Test suite ${filePath}`);

  const name = readRequiredString(parsed['name'], `${filePath} name`);
  const description = readOptionalString(parsed['description'], `${filePath} description`);
  const tests = readStringArray(parsed['tests'], `${filePath} tests`);
  if (tests.length === 0) {
    throw new Error(`Test suite ${filePath} must define a non-empty tests array.`);
  }

  const relativePath = path.relative(suitesDir, filePath).split(path.sep).join('/');
  return {
    name,
    description,
    tests,
    sourcePath: filePath,
    relativePath,
    suiteId: sanitizeId(relativePath),
  };
}

export function validateTestBindings(
  test: TestDefinition,
  envConfig: EnvironmentConfig,
  options?: { environmentResolved?: boolean },
): void {
  const unresolvedReferences = new Set<string>();
  const values = [
    test.name,
    test.description,
    ...test.steps,
    ...test.expected_state,
  ].filter((value): value is string => typeof value === 'string');

  for (const value of values) {
    for (const match of value.matchAll(TEST_REFERENCE_PATTERN)) {
      const namespace = match[1];
      const key = match[2];
      if (namespace === 'variables' && envConfig.variables[key] === undefined) {
        unresolvedReferences.add(match[0]);
      }
      if (namespace === 'secrets' && envConfig.secrets[key] === undefined) {
        unresolvedReferences.add(match[0]);
      }
    }
  }

  if (unresolvedReferences.size > 0) {
    if (options?.environmentResolved === false) {
      throw new Error(
        `Test references environment bindings, but no environment configuration was resolved. Add .finalrun/env/<name>.yaml or pass --env <name>: ${Array.from(unresolvedReferences).join(', ')}`,
      );
    }
    throw new Error(
      `Test references unknown environment bindings: ${Array.from(unresolvedReferences).join(', ')}`,
    );
  }
}

function parseYamlDocument(raw: string, filePath: string): unknown {
  const document = YAML.parseDocument(raw);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new Error(`Invalid YAML in ${filePath}: ${firstError.message}`);
  }
  return document.toJS();
}

function readSecrets(
  value: unknown,
  filePath: string,
  runtimeEnv: CliEnv,
): {
  references: SecretReference[];
  bindings: Record<string, string>;
} {
  if (value === undefined || value === null) {
    return { references: [], bindings: {} };
  }

  assertPlainObject(value, `${filePath} secrets`);
  const references: SecretReference[] = [];
  const bindings: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue !== 'string') {
      throw new Error(`${filePath} secrets.${key} must be a string placeholder.`);
    }
    const match = rawValue.match(SECRET_PLACEHOLDER);
    if (!match) {
      throw new Error(`${filePath} secrets.${key} must use the exact form \${ENV_VAR}.`);
    }

    const envVar = match[1]!;
    const resolvedValue = runtimeEnv.get(envVar);
    if (resolvedValue === undefined) {
      throw new Error(
        `${filePath} secrets.${key} references missing environment variable ${envVar}.`,
      );
    }

    references.push({ key, envVar });
    bindings[key] = resolvedValue;
  }

  return { references, bindings };
}

function readVariables(
  value: unknown,
  filePath: string,
): Record<string, VariableValue> {
  if (value === undefined || value === null) {
    return {};
  }

  assertPlainObject(value, `${filePath} variables`);
  const variables: Record<string, VariableValue> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (
      typeof rawValue !== 'string' &&
      typeof rawValue !== 'number' &&
      typeof rawValue !== 'boolean'
    ) {
      throw new Error(`${filePath} variables.${key} must be a string, number, or boolean.`);
    }
    variables[key] = rawValue;
  }

  return variables;
}

function readStringArray(value: unknown, label: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function readRequiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string when provided.`);
  }
  return value;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping/object.`);
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} contains unsupported key "${key}".`);
    }
  }
}
