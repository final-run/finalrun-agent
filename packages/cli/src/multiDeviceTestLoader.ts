import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import YAML from 'yaml';
import type {
  MultiDeviceTestDefinition,
  MultiDeviceTestDevice,
  MultiDeviceParallelBlock,
  MultiDevicePhaseItem,
  EnvironmentConfig,
} from '@finalrun/common';
import { isParallelBlock } from '@finalrun/common';
import { sanitizeId } from './workspace.js';

const MULTI_DEVICE_TOP_LEVEL_KEYS = new Set([
  'name',
  'description',
  'devices',
  'setup',
  'steps',
  'expected_state',
]);

const DEVICE_KEYS = new Set(['app']);

const BINDING_REFERENCE_PATTERN = /\$\{(variables|secrets)\.([A-Za-z0-9_-]+)\}/g;

export async function loadMultiDeviceTest(
  filePath: string,
  multiDeviceTestsDir: string,
): Promise<MultiDeviceTestDefinition> {
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = parseYamlDocument(raw, filePath);
  assertPlainObject(parsed, `Multi-device test file ${filePath}`);
  assertAllowedKeys(parsed, MULTI_DEVICE_TOP_LEVEL_KEYS, `Multi-device test file ${filePath}`);

  const name = readRequiredString(parsed['name'], `${filePath} name`);
  const description = readOptionalString(parsed['description'], `${filePath} description`);
  const devices = readDevices(parsed['devices'], filePath);
  const deviceRoles = new Set(devices.map((d) => d.role));

  const setup = readMultiDeviceSteps(parsed['setup'], deviceRoles, `${filePath} setup`);
  const steps = readMultiDeviceSteps(parsed['steps'], deviceRoles, `${filePath} steps`);
  const expected_state = readMultiDeviceSteps(
    parsed['expected_state'],
    deviceRoles,
    `${filePath} expected_state`,
  );

  if (steps.length === 0) {
    throw new Error(`Multi-device test file ${filePath} must define a non-empty steps array.`);
  }

  const relativePath = path.relative(multiDeviceTestsDir, filePath).split(path.sep).join('/');
  return {
    name,
    description,
    devices,
    setup,
    steps,
    expected_state,
    sourcePath: filePath,
    relativePath,
    testId: sanitizeId(relativePath),
  };
}

export function validateMultiDeviceTestBindings(
  test: MultiDeviceTestDefinition,
  envConfig: EnvironmentConfig,
  options?: { environmentResolved?: boolean },
): void {
  const unresolvedReferences = new Set<string>();
  const collectActions = (items: MultiDevicePhaseItem[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      if (isParallelBlock(item)) {
        for (const lane of item.lanes) {
          out.push(...lane.actions);
        }
      } else {
        out.push(item.action);
      }
    }
    return out;
  };
  const values = [
    test.name,
    test.description,
    ...collectActions(test.setup),
    ...collectActions(test.steps),
    ...collectActions(test.expected_state),
  ].filter((value): value is string => typeof value === 'string');

  for (const value of values) {
    for (const match of value.matchAll(BINDING_REFERENCE_PATTERN)) {
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
        `Multi-device test references environment bindings, but no environment configuration was resolved. Add .finalrun/env/<name>.yaml or pass --env <name>: ${Array.from(unresolvedReferences).join(', ')}`,
      );
    }
    throw new Error(
      `Multi-device test references unknown environment bindings: ${Array.from(unresolvedReferences).join(', ')}`,
    );
  }
}

// ---------- private ----------

function readDevices(
  value: unknown,
  filePath: string,
): MultiDeviceTestDevice[] {
  if (value === undefined || value === null) {
    throw new Error(`${filePath} must define a devices mapping.`);
  }
  assertPlainObject(value, `${filePath} devices`);

  const entries = Object.entries(value);
  if (entries.length !== 2) {
    throw new Error(
      `${filePath} devices must define exactly 2 devices, got ${entries.length}.`,
    );
  }

  return entries.map(([role, deviceConfig]) => {
    assertPlainObject(deviceConfig, `${filePath} devices.${role}`);
    assertAllowedKeys(
      deviceConfig as Record<string, unknown>,
      DEVICE_KEYS,
      `${filePath} devices.${role}`,
    );

    const app = (deviceConfig as Record<string, unknown>)['app'];
    if (typeof app !== 'string' || app.trim() === '') {
      throw new Error(`${filePath} devices.${role}.app must be a non-empty string.`);
    }

    return { role, app: app.trim() };
  });
}

function readMultiDeviceSteps(
  value: unknown,
  deviceRoles: Set<string>,
  label: string,
): MultiDevicePhaseItem[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(
        `${itemLabel} must be a mapping — either {<device>: "action"} or {parallel: {<device>: [...], ...}}.`,
      );
    }

    const keys = Object.keys(item);
    if (keys.length !== 1) {
      throw new Error(
        `${itemLabel} must have exactly one top-level key, got ${keys.length}: ${keys.join(', ')}.`,
      );
    }

    const topKey = keys[0]!;

    // Parallel block form: { parallel: { <role>: [action, ...], ... } }
    if (topKey === 'parallel') {
      return readParallelBlock(
        (item as Record<string, unknown>)[topKey],
        deviceRoles,
        itemLabel,
      );
    }

    // Sequential step form: { <role>: "action text" }
    const device = topKey;
    if (!deviceRoles.has(device)) {
      const available = Array.from(deviceRoles).join(', ');
      throw new Error(
        `${itemLabel} references unknown device role "${device}". Available roles: ${available}.`,
      );
    }

    const action = (item as Record<string, unknown>)[device];
    if (typeof action !== 'string' || action.trim() === '') {
      throw new Error(
        `${itemLabel} action for device "${device}" must be a non-empty string.`,
      );
    }

    return { device, action: action.trim() };
  });
}

function readParallelBlock(
  value: unknown,
  deviceRoles: Set<string>,
  label: string,
): MultiDeviceParallelBlock {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `${label}.parallel must be a mapping of {<device>: [action, action, ...], ...}.`,
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${label}.parallel must include at least one lane.`);
  }
  if (entries.length === 1) {
    throw new Error(
      `${label}.parallel with only one lane offers no parallelism. ` +
        `Use a plain sequential step instead, or add another lane.`,
    );
  }

  const seenDevices = new Set<string>();
  const lanes = entries.map(([device, actions]) => {
    if (!deviceRoles.has(device)) {
      const available = Array.from(deviceRoles).join(', ');
      throw new Error(
        `${label}.parallel references unknown device role "${device}". Available roles: ${available}.`,
      );
    }
    if (seenDevices.has(device)) {
      throw new Error(
        `${label}.parallel has duplicate lane for device "${device}".`,
      );
    }
    seenDevices.add(device);

    if (!Array.isArray(actions)) {
      throw new Error(
        `${label}.parallel.${device} must be an array of action strings.`,
      );
    }
    const laneActions = actions.map((actionValue, actionIndex) => {
      if (typeof actionValue !== 'string' || actionValue.trim() === '') {
        throw new Error(
          `${label}.parallel.${device}[${actionIndex}] must be a non-empty string.`,
        );
      }
      return actionValue.trim();
    });

    if (laneActions.length === 0) {
      throw new Error(
        `${label}.parallel.${device} must have at least one action.`,
      );
    }

    return { device, actions: laneActions };
  });

  return { kind: 'parallel' as const, lanes };
}

function parseYamlDocument(raw: string, filePath: string): unknown {
  const document = YAML.parseDocument(raw);
  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    throw new Error(`Invalid YAML in ${filePath}: ${firstError.message}`);
  }
  return document.toJS();
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
      throw new Error(`${label} contains unsupported key "${key}".`);
    }
  }
}
