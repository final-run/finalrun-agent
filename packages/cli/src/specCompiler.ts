import type { LoadedRepoTestSpec, RuntimeBindings } from '@finalrun/common';

const VARIABLE_REFERENCE_PATTERN = /\$\{variables\.([A-Za-z0-9_-]+)\}/g;

export function compileSpecToGoal(
  spec: LoadedRepoTestSpec,
  bindings: RuntimeBindings,
): string {
  const sections: string[] = [
    `Test Name: ${interpolateVariables(spec.name, bindings)}`,
    `Spec Path: ${spec.relativePath}`,
  ];

  if (spec.description) {
    sections.push(`Description: ${interpolateVariables(spec.description, bindings)}`);
  }

  if (spec.setup.length > 0) {
    sections.push(
      formatNumberedSection(
        'Setup',
        spec.setup.map((item) => interpolateVariables(item, bindings)),
      ),
    );
  }

  sections.push(
    formatNumberedSection(
      'Steps',
      spec.steps.map((item) => interpolateVariables(item, bindings)),
    ),
  );

  if (spec.assertions.length > 0) {
    sections.push(
      formatBulletSection(
        'Assertions',
        spec.assertions.map((item) => interpolateVariables(item, bindings)),
      ),
    );
  }

  sections.push(
    [
      'Execution Rules:',
      '- Treat any ${secrets.*} placeholder as a logical token. Do not invent or expose the real value.',
      '- If a secret token is needed in a typing or deeplink action, echo the token exactly as written.',
      '- Keep the action descriptions grounded in the current screen and follow the spec sections above.',
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
