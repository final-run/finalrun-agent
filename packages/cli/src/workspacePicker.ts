import { createInterface } from 'node:readline/promises';

export interface WorkspaceSelectionIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  isTTY: boolean;
}

export interface WorkspacePickerEntry {
  label: string;
  workspaceRoot: string;
}

interface NumberedWorkspaceEntry {
  entry: WorkspacePickerEntry;
  index: number;
}

export class WorkspaceSelectionCancelledError extends Error {
  readonly exitCode = 1;

  constructor() {
    super('Workspace selection cancelled.');
    this.name = 'WorkspaceSelectionCancelledError';
  }
}

export async function promptForWorkspaceSelection(params: {
  heading: string;
  entries: WorkspacePickerEntry[];
  io: WorkspaceSelectionIO;
}): Promise<WorkspacePickerEntry> {
  if (!params.io.isTTY) {
    throw new Error('Interactive workspace selection requires a TTY.');
  }

  const rendered = formatWorkspaceSelectionList(params.entries);
  params.io.output.write(`\n${params.heading}\n`);
  params.io.output.write(`${rendered.text}\n`);

  const readline = createInterface({
    input: params.io.input,
    output: params.io.output,
  });

  try {
    for (;;) {
      const answer = (await readline.question('Enter a workspace number (q to cancel): ')).trim();
      if (answer.length === 0 || answer.toLowerCase() === 'q') {
        throw new WorkspaceSelectionCancelledError();
      }

      const selection = Number.parseInt(answer, 10);
      const matched = rendered.numberedEntries.find((candidate) => candidate.index === selection);
      if (matched) {
        return matched.entry;
      }

      params.io.output.write('Invalid selection. Enter one of the listed numbers, or q to cancel.\n');
    }
  } finally {
    readline.close();
  }
}

export function formatWorkspaceSelectionList(entries: WorkspacePickerEntry[]): {
  text: string;
  numberedEntries: NumberedWorkspaceEntry[];
} {
  const lines: string[] = [];
  const numberedEntries: NumberedWorkspaceEntry[] = [];

  for (const [offset, entry] of entries.entries()) {
    const index = offset + 1;
    numberedEntries.push({ entry, index });
    lines.push(`${index}. ${entry.label}`);
    lines.push(`   ${entry.workspaceRoot}`);
  }

  return {
    text: lines.join('\n'),
    numberedEntries,
  };
}
