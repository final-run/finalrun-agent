import type {
  MultiDeviceConfig,
  RuntimeBindings,
  TestDefinition,
} from '@finalrun/common';

/**
 * Variable reference pattern. Matches `${variables.NAME}` only — `${devices.*}`
 * and `${secrets.*}` tokens are preserved literally so the planner prompt
 * observes them verbatim.
 */
const VARIABLE_REFERENCE_PATTERN = /\$\{variables\.([A-Za-z0-9_-]+)\}/g;

/**
 * Compile a multi-device test into the planner goal string.
 *
 * The emitted goal mirrors the single-device `compileTestObjective()` output
 * with an additional `Devices:` header block listing each device's `{key,
 * platform, app}` triple. `${variables.*}` tokens are interpolated eagerly;
 * `${devices.*}` and `${secrets.*}` tokens pass through unchanged so the
 * planner sees them exactly as authored.
 *
 * Pure function — no side effects; safe for unit testing without fixtures.
 */
export function compileMultiDeviceTestObjective(
  test: TestDefinition,
  devices: MultiDeviceConfig,
  bindings: RuntimeBindings,
): string {
  const sections: string[] = [
    `Test Name: ${interpolateVariables(test.name, bindings)}`,
    `Test Path: ${test.relativePath!}`,
  ];

  if (test.description) {
    sections.push(`Description: ${interpolateVariables(test.description, bindings)}`);
  }

  sections.push(formatDevicesHeader(devices));

  if (test.setup.length > 0) {
    sections.push(
      formatNumberedSection(
        'Setup',
        test.setup.map((item) => interpolateVariables(item, bindings)),
      ),
    );
  }

  sections.push(
    formatNumberedSection(
      'Steps',
      test.steps.map((item) => interpolateVariables(item, bindings)),
    ),
  );

  if (test.expected_state.length > 0) {
    sections.push(
      formatBulletSection(
        'Expected State (verify after all steps are complete)',
        test.expected_state.map((item) => interpolateVariables(item, bindings)),
      ),
    );
  }

  sections.push(
    [
      'Execution Rules:',
      '- Treat any ${secrets.*} placeholder as a logical token. Do not invent or expose the real value.',
      '- Treat any ${devices.<key>} token as the device selector for that step; never substitute the key with an IP, ID, or nickname.',
      '- If a secret token is needed in a typing or deeplink action, echo the token exactly as written.',
      '- Keep the action descriptions grounded in the current screen and follow the test sections above.',
    ].join('\n'),
  );

  return sections.join('\n\n');
}

function formatDevicesHeader(devices: MultiDeviceConfig): string {
  const lines = ['Devices:'];
  for (const [key, def] of Object.entries(devices.devices)) {
    lines.push(`- ${key}: platform=${def.platform}, app=${def.app}`);
  }
  return lines.join('\n');
}

function interpolateVariables(value: string, bindings: RuntimeBindings): string {
  return value.replace(VARIABLE_REFERENCE_PATTERN, (_match, key: string) => {
    const variableValue = bindings.variables[key];
    return variableValue === undefined ? `\${variables.${key}}` : String(variableValue);
  });
}

function formatBulletSection(title: string, items: string[]): string {
  return [title + ':', ...items.map((item) => `- ${item}`)].join('\n');
}

function formatNumberedSection(title: string, items: string[]): string {
  return [
    title + ':',
    ...items.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}
