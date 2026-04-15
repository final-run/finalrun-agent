import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
  DeviceDefinition,
  MultiDeviceConfig,
  SuiteDefinition,
  TestDefinition,
} from '@finalrun/common';
import { PLATFORM_ANDROID } from '@finalrun/common';
import { isYamlFile, sanitizeId } from './workspace.js';

/**
 * Multi-device test loader.
 *
 * Parses `.finalrun/multi-device/devices.yaml`, tests, and suites.
 *
 * Validation rules (v1, 2 devices, same platform):
 *   (a) `devices.yaml` must declare exactly 2 entries;
 *   (b) both entries must share the same `platform`;
 *   (c) v1 rejects any `platform !== 'android'`;
 *   (d) every step string must contain ≥1 `${devices.X}` token where X is a
 *       defined device key;
 *   (e) references use the regex `/\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g`;
 *   (f) unknown device key → fail with the full device list;
 *   (g) multi-device suites may reference multi-device tests only.
 */

const DEVICES_FILE_NAME = 'devices.yaml';
const DEVICES_FILE_NAME_ALT = 'devices.yml';
const DEVICE_TOP_LEVEL_KEYS = new Set(['devices']);
const DEVICE_ENTRY_KEYS = new Set(['platform', 'app']);
const TEST_TOP_LEVEL_KEYS = new Set([
  'name',
  'description',
  'setup',
  'steps',
  'expected_state',
]);
const SUITE_TOP_LEVEL_KEYS = new Set(['name', 'description', 'tests']);

export const MULTI_DEVICE_REFERENCE_PATTERN =
  /\$\{(variables|secrets|devices)\.([A-Za-z0-9_-]+)\}/g;

const DEVICE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface LoadedMultiDeviceConfig {
  config: MultiDeviceConfig;
  sourcePath: string;
}

export async function loadMultiDeviceConfig(
  multiDeviceDir: string,
): Promise<LoadedMultiDeviceConfig> {
  const candidatePaths = [
    path.join(multiDeviceDir, DEVICES_FILE_NAME),
    path.join(multiDeviceDir, DEVICES_FILE_NAME_ALT),
  ];
  let sourcePath: string | undefined;
  for (const candidate of candidatePaths) {
    if (await pathExists(candidate)) {
      sourcePath = candidate;
      break;
    }
  }
  if (!sourcePath) {
    throw new Error(
      `Missing multi-device manifest. Expected ${path.join(multiDeviceDir, DEVICES_FILE_NAME)}.`,
    );
  }

  const raw = await fs.readFile(sourcePath, 'utf-8');
  const parsed = parseYamlDocument(raw, sourcePath);
  assertPlainObject(parsed, `Devices manifest ${sourcePath}`);
  assertAllowedKeys(parsed, DEVICE_TOP_LEVEL_KEYS, `Devices manifest ${sourcePath}`);

  const devicesValue = parsed['devices'];
  assertPlainObject(devicesValue, `${sourcePath} devices`);

  const deviceKeys = Object.keys(devicesValue);
  if (deviceKeys.length !== 2) {
    throw new Error(
      `Devices manifest ${sourcePath} must declare exactly 2 devices (found ${deviceKeys.length}).`,
    );
  }

  const devices: Record<string, DeviceDefinition> = {};
  const seenKeys = new Set<string>();
  for (const key of deviceKeys) {
    if (!DEVICE_KEY_PATTERN.test(key)) {
      throw new Error(
        `Devices manifest ${sourcePath} device key "${key}" must match ${DEVICE_KEY_PATTERN}.`,
      );
    }
    if (seenKeys.has(key)) {
      throw new Error(
        `Devices manifest ${sourcePath} contains duplicate device key "${key}".`,
      );
    }
    seenKeys.add(key);
    const entry = (devicesValue as Record<string, unknown>)[key];
    devices[key] = readDeviceDefinition(entry, `${sourcePath} devices.${key}`);
  }

  const platforms = new Set(Object.values(devices).map((d) => d.platform));
  if (platforms.size !== 1) {
    throw new Error(
      `Devices manifest ${sourcePath} must declare devices sharing a single platform (found: ${Array.from(
        platforms,
      ).join(', ')}).`,
    );
  }
  const platform = Array.from(platforms)[0]!;
  if (platform !== PLATFORM_ANDROID) {
    throw new Error(
      `Devices manifest ${sourcePath}: v1 supports only platform "${PLATFORM_ANDROID}" (got "${platform}"). iOS multi-device is planned for v2.`,
    );
  }

  return {
    config: { devices },
    sourcePath,
  };
}

export async function loadMultiDeviceTest(
  filePath: string,
  testsDir: string,
  config: MultiDeviceConfig,
): Promise<TestDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseYamlDocument(raw, filePath);
  assertPlainObject(parsed, `Multi-device test file ${filePath}`);
  assertAllowedKeys(parsed, TEST_TOP_LEVEL_KEYS, `Multi-device test file ${filePath}`);

  const name = readRequiredString(parsed['name'], `${filePath} name`);
  const description = readOptionalString(parsed['description'], `${filePath} description`);
  const setup = readStringArray(parsed['setup'], `${filePath} setup`);
  const steps = readStringArray(parsed['steps'], `${filePath} steps`);
  const expected_state = readStringArray(
    parsed['expected_state'],
    `${filePath} expected_state`,
  );

  if (steps.length === 0) {
    throw new Error(`Multi-device test file ${filePath} must define a non-empty steps array.`);
  }

  validateDeviceTokensInSteps(filePath, steps, config);

  const relativePath = path.relative(testsDir, filePath).split(path.sep).join('/');
  return {
    name,
    description,
    setup,
    steps,
    expected_state,
    sourcePath: filePath,
    relativePath,
    testId: sanitizeId(relativePath),
  };
}

export async function loadMultiDeviceTestSuite(
  filePath: string,
  suitesDir: string,
): Promise<SuiteDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseYamlDocument(raw, filePath);
  assertPlainObject(parsed, `Multi-device test suite ${filePath}`);
  assertAllowedKeys(
    parsed,
    SUITE_TOP_LEVEL_KEYS,
    `Multi-device test suite ${filePath}`,
  );

  const name = readRequiredString(parsed['name'], `${filePath} name`);
  const description = readOptionalString(parsed['description'], `${filePath} description`);
  const tests = readStringArray(parsed['tests'], `${filePath} tests`);
  if (tests.length === 0) {
    throw new Error(
      `Multi-device test suite ${filePath} must define a non-empty tests array.`,
    );
  }

  for (const entry of tests) {
    if (entry.includes('..')) {
      throw new Error(
        `Multi-device suite ${filePath}: entry "${entry}" must stay within the multi-device tests tree.`,
      );
    }
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

/**
 * Walk the multi-device tests tree and return every test definition (validated
 * against `config`). Parallels `selectTestFiles()` for the single-device path.
 */
export async function collectAllMultiDeviceTests(
  testsDir: string,
  config: MultiDeviceConfig,
): Promise<TestDefinition[]> {
  if (!(await pathExists(testsDir))) {
    return [];
  }
  const yamlFiles = (await collectYamlFiles(testsDir)).sort();
  const tests: TestDefinition[] = [];
  for (const filePath of yamlFiles) {
    tests.push(await loadMultiDeviceTest(filePath, testsDir, config));
  }
  return tests;
}

function validateDeviceTokensInSteps(
  filePath: string,
  steps: string[],
  config: MultiDeviceConfig,
): void {
  const knownKeys = new Set(Object.keys(config.devices));
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    const stepLabel = `${filePath} steps[${index}]`;
    const matches = Array.from(step.matchAll(MULTI_DEVICE_REFERENCE_PATTERN));
    const deviceMatches = matches.filter((m) => m[1] === 'devices');
    if (deviceMatches.length === 0) {
      throw new Error(
        `${stepLabel} must reference at least one device via \${devices.<key>} (known keys: ${Array.from(
          knownKeys,
        ).join(', ')}).`,
      );
    }
    for (const match of deviceMatches) {
      const key = match[2]!;
      if (!knownKeys.has(key)) {
        throw new Error(
          `${stepLabel} references unknown device "${key}" (known keys: ${Array.from(
            knownKeys,
          ).join(', ')}).`,
        );
      }
    }
  }
}

function readDeviceDefinition(value: unknown, label: string): DeviceDefinition {
  assertPlainObject(value, label);
  assertAllowedKeys(value, DEVICE_ENTRY_KEYS, label);
  const platform = readRequiredString(value['platform'], `${label}.platform`);
  const app = readRequiredString(value['app'], `${label}.app`);
  return { platform, app };
}

async function collectYamlFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const filePaths: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await collectYamlFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && isYamlFile(fullPath)) {
      filePaths.push(fullPath);
    }
  }
  return filePaths;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
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

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
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
      throw new Error(
        `${label} contains unsupported key "${key}". Supported keys: ${Array.from(
          allowedKeys,
        ).join(', ')}.`,
      );
    }
  }
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
