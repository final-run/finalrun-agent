import type { TestDefinition, RuntimeBindings } from '@finalrun/common';

const VARIABLE_REFERENCE_PATTERN = /\$\{variables\.([A-Za-z0-9_-]+)\}/g;

export function compileTestObjective(
  test: TestDefinition,
  bindings: RuntimeBindings,
): string {
  const sections: string[] = [
    `Test Name: ${interpolateVariables(test.name, bindings)}`,
    `Test Path: ${test.relativePath!}`,
  ];

  if (test.description) {
    sections.push(`Description: ${interpolateVariables(test.description, bindings)}`);
  }

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

  if (test.assertions.length > 0) {
    sections.push(
      formatBulletSection(
        'Assertions',
        test.assertions.map((item) => interpolateVariables(item, bindings)),
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

function interpolateVariables(
  value: string,
  bindings: RuntimeBindings,
): string {
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
