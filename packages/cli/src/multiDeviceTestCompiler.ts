import type {
  MultiDeviceTestDefinition,
  MultiDevicePhaseItem,
  RuntimeBindings,
} from '@finalrun/common';
import { isParallelBlock } from '@finalrun/common';

const VARIABLE_REFERENCE_PATTERN = /\$\{variables\.([A-Za-z0-9_-]+)\}/g;

export function compileMultiDeviceTestObjective(
  test: MultiDeviceTestDefinition,
  bindings: RuntimeBindings,
): string {
  const sections: string[] = [
    `Test Name: ${interpolateVariables(test.name, bindings)}`,
    `Test Path: ${test.relativePath!}`,
  ];

  if (test.description) {
    sections.push(`Description: ${interpolateVariables(test.description, bindings)}`);
  }

  sections.push(
    formatDevicesSection(test),
  );

  if (test.setup.length > 0) {
    sections.push(formatPhaseSection('Setup', test.setup, bindings));
  }

  sections.push(formatPhaseSection('Steps', test.steps, bindings));

  if (test.expected_state.length > 0) {
    sections.push(
      formatPhaseSection(
        'Expected State (verify after all steps are complete)',
        test.expected_state,
        bindings,
      ),
    );
  }

  sections.push(
    [
      'Execution Rules:',
      '- Treat any ${secrets.*} placeholder as a logical token. Do not invent or expose the real value.',
      '- If a secret token is needed in a typing or deeplink action, echo the token exactly as written.',
      '- Keep the action descriptions grounded in the current screen and follow the test sections above.',
    ].join('\n'),
  );

  return sections.join('\n\n');
}

function formatDevicesSection(test: MultiDeviceTestDefinition): string {
  const lines = test.devices.map((d) => `  ${d.role}: ${d.app}`);
  return ['Devices:', ...lines].join('\n');
}

function interpolateVariables(
  value: string,
  bindings: RuntimeBindings,
): string {
  return value.replace(VARIABLE_REFERENCE_PATTERN, (_match, key: string) => {
    const variableValue = bindings.variables[key];
    return variableValue === undefined ? `\${variables.${key}}` : String(variableValue);
  });
}

function formatPhaseSection(
  title: string,
  items: MultiDevicePhaseItem[],
  bindings: RuntimeBindings,
): string {
  const lines = [`${title}:`];
  items.forEach((item, index) => {
    const prefix = `${index + 1}.`;
    if (isParallelBlock(item)) {
      lines.push(`${prefix} [parallel — all lanes run concurrently]`);
      item.lanes.forEach((lane) => {
        lines.push(`     [${lane.device}]`);
        lane.actions.forEach((action, actionIndex) => {
          lines.push(
            `       ${actionIndex + 1}. ${interpolateVariables(action, bindings)}`,
          );
        });
      });
    } else {
      lines.push(
        `${prefix} [${item.device}] ${interpolateVariables(item.action, bindings)}`,
      );
    }
  });
  return lines.join('\n');
}
