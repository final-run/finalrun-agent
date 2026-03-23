import { createInterface } from 'node:readline/promises';
import type {
  CommandTranscript,
  DeviceInventoryDiagnostic,
  DeviceInventoryEntry,
} from '@finalrun/common';

export interface DeviceSelectionIO {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  isTTY: boolean;
}

interface NumberedEntry {
  entry: DeviceInventoryEntry;
  index: number;
}

interface EntrySection {
  title: string;
  entries: DeviceInventoryEntry[];
}

export async function promptForDeviceSelection(params: {
  heading: string;
  entries: DeviceInventoryEntry[];
  io: DeviceSelectionIO;
}): Promise<DeviceInventoryEntry> {
  if (!params.io.isTTY) {
    throw new Error('Interactive device selection requires a TTY.');
  }

  const rendered = formatDeviceSelectionList(params.entries);
  params.io.output.write(`\n${params.heading}\n`);
  params.io.output.write(`${rendered.text}\n`);

  const readline = createInterface({
    input: params.io.input,
    output: params.io.output,
  });

  try {
    for (;;) {
      const answer = await readline.question('Enter a device number: ');
      const selection = Number.parseInt(answer.trim(), 10);
      const matched = rendered.numberedEntries.find((candidate) => candidate.index === selection);
      if (matched) {
        return matched.entry;
      }
      params.io.output.write('Invalid selection. Enter one of the listed numbers.\n');
    }
  } finally {
    readline.close();
  }
}

export function formatDeviceSelectionList(entries: DeviceInventoryEntry[]): {
  text: string;
  numberedEntries: NumberedEntry[];
} {
  const sections = buildEntrySections(entries);
  const lines: string[] = [];
  const numberedEntries: NumberedEntry[] = [];
  let index = 1;

  for (const section of sections) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(section.title);
    for (const entry of section.entries) {
      numberedEntries.push({ entry, index });
      lines.push(`  ${index}. ${entry.displayName}`);
      index += 1;
    }
  }

  return {
    text: lines.join('\n'),
    numberedEntries,
  };
}

export function formatDiagnosticsForOutput(diagnostics: DeviceInventoryDiagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const transcripts = diagnostic.transcripts.map(formatTranscriptBlock);
      if (transcripts.length === 0) {
        return diagnostic.summary;
      }
      return [diagnostic.summary, ...transcripts].join('\n\n');
    })
    .join('\n\n');
}

export function printDiagnosticsFailure(params: {
  heading: string;
  diagnostics: DeviceInventoryDiagnostic[];
  output: NodeJS.WritableStream;
}): void {
  if (params.diagnostics.length === 0) {
    return;
  }

  const renderedDiagnostics = formatDiagnosticsForOutput(params.diagnostics);
  params.output.write(`\n${params.heading}\n`);
  params.output.write(`${renderedDiagnostics}\n`);
}

function buildEntrySections(entries: DeviceInventoryEntry[]): EntrySection[] {
  const runnableAndroid = entries.filter(
    (entry) => entry.runnable && entry.platform === 'android',
  );
  const runnableIOS = entries.filter(
    (entry) => entry.runnable && entry.platform === 'ios',
  );
  const startableAndroid = entries.filter(
    (entry) => entry.startable && entry.platform === 'android',
  );
  const startableIOS = entries.filter(
    (entry) => entry.startable && entry.platform === 'ios',
  );

  const sections: EntrySection[] = [];
  if (runnableAndroid.length > 0) {
    sections.push({ title: 'Runnable Android Devices', entries: runnableAndroid });
  }
  if (runnableIOS.length > 0) {
    sections.push({ title: 'Runnable iOS Simulators', entries: runnableIOS });
  }
  if (runnableAndroid.length === 0 && runnableIOS.length === 0 && startableAndroid.length > 0) {
    sections.push({ title: 'Startable Android Emulators', entries: startableAndroid });
  }
  if (runnableAndroid.length === 0 && runnableIOS.length === 0 && startableIOS.length > 0) {
    sections.push({ title: 'Startable iOS Simulators', entries: startableIOS });
  }
  return sections;
}

function formatTranscriptBlock(transcript: CommandTranscript): string {
  const lines = [`Command: ${transcript.command}`];
  lines.push('stdout:');
  lines.push(transcript.stdout.length > 0 ? transcript.stdout : '(empty)');
  lines.push('stderr:');
  lines.push(transcript.stderr.length > 0 ? transcript.stderr : '(empty)');
  lines.push(`exitCode: ${transcript.exitCode ?? 'null'}`);
  return lines.join('\n');
}
