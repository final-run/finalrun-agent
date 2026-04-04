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

interface FormatResult {
  text: string;
  numberedEntries: NumberedEntry[];
}

interface EntrySection {
  title: string;
  entries: DeviceInventoryEntry[];
}

export async function promptForDeviceSelection(params: {
  heading: string;
  entries: DeviceInventoryEntry[];
  selectableEntries?: DeviceInventoryEntry[];
  io: DeviceSelectionIO;
}): Promise<DeviceInventoryEntry> {
  const rendered = formatDeviceSelectionList(
    params.entries,
    params.selectableEntries ?? params.entries,
  );

  params.io.output.write(`\n${params.heading}\n`);
  params.io.output.write(`${rendered.text}\n`);

  if (params.io.isTTY) {
    return await interactiveSelection(rendered, params.io);
  }
  return await pipedSelection(rendered, params.io);
}

async function interactiveSelection(
  rendered: FormatResult,
  io: DeviceSelectionIO,
): Promise<DeviceInventoryEntry> {
  const readline = createInterface({
    input: io.input,
    output: io.output,
  });

  try {
    for (;;) {
      const answer = await readline.question('Enter a device number: ');
      const selection = Number.parseInt(answer.trim(), 10);
      const matched = rendered.numberedEntries.find((candidate) => candidate.index === selection);
      if (matched) {
        return matched.entry;
      }
      io.output.write('Invalid selection. Enter one of the listed numbers.\n');
    }
  } finally {
    readline.close();
  }
}

async function pipedSelection(
  rendered: FormatResult,
  io: DeviceSelectionIO,
): Promise<DeviceInventoryEntry> {
  const line = await readFirstLine(io.input);
  if (line === null) {
    const validNums = rendered.numberedEntries.map((e) => e.index).join(', ');
    throw new Error(
      `Multiple devices available (${validNums}). ` +
        'Pipe a device number to select one, for example: echo "1" | finalrun test ...',
    );
  }
  const selection = Number.parseInt(line.trim(), 10);
  const matched = rendered.numberedEntries.find((candidate) => candidate.index === selection);
  if (matched) {
    return matched.entry;
  }
  const validNums = rendered.numberedEntries.map((e) => e.index).join(', ');
  throw new Error(
    `Invalid device number "${line.trim()}". Valid numbers: ${validNums}`,
  );
}

function readFirstLine(stream: NodeJS.ReadableStream): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const rs = stream as NodeJS.ReadableStream & {
      readableEnded?: boolean;
      readable?: boolean;
    };
    if (rs.readableEnded || rs.readable === false) {
      return resolve(null);
    }

    let buffer = '';
    let settled = false;

    const cleanup = (): void => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    };

    const onData = (chunk: Buffer | string): void => {
      if (settled) {
        return;
      }
      buffer += String(chunk);
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        settled = true;
        cleanup();
        resolve(buffer.substring(0, newlineIndex));
      }
    };

    const onEnd = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(buffer.trim().length > 0 ? buffer.trim() : null);
    };

    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

export function formatDeviceSelectionList(entries: DeviceInventoryEntry[]): {
  text: string;
  numberedEntries: NumberedEntry[];
}
export function formatDeviceSelectionList(
  entries: DeviceInventoryEntry[],
  selectableEntries: DeviceInventoryEntry[],
): {
  text: string;
  numberedEntries: NumberedEntry[];
}
export function formatDeviceSelectionList(
  entries: DeviceInventoryEntry[],
  selectableEntries: DeviceInventoryEntry[] = entries,
): {
  text: string;
  numberedEntries: NumberedEntry[];
} {
  const selectableIds = new Set(selectableEntries.map((entry) => entry.selectionId));
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
      if (selectableIds.has(entry.selectionId)) {
        numberedEntries.push({ entry, index });
        lines.push(`  ${index}. ${entry.displayName} (${formatEntryState(entry)})`);
        index += 1;
      } else {
        lines.push(`  - ${entry.displayName} (${formatEntryState(entry)})`);
      }
    }
  }

  return {
    text: lines.join('\n'),
    numberedEntries,
  };
}

export function printInventorySummary(params: {
  heading: string;
  entries: DeviceInventoryEntry[];
  selectableEntries: DeviceInventoryEntry[];
  output: NodeJS.WritableStream;
}): void {
  const rendered = formatDeviceSelectionList(params.entries, params.selectableEntries);
  if (!rendered.text) {
    return;
  }

  params.output.write(`\n${params.heading}\n`);
  params.output.write(`${rendered.text}\n`);
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
  const readyEntries = entries.filter((entry) => entry.runnable);
  const startableEntries = entries.filter((entry) => !entry.runnable && entry.startable);
  const unavailableEntries = entries.filter((entry) => !entry.runnable && !entry.startable);

  const sections: EntrySection[] = [];
  if (readyEntries.length > 0) {
    sections.push({ title: 'Ready Targets', entries: readyEntries });
  }
  if (startableEntries.length > 0) {
    sections.push({ title: 'Available to Start', entries: startableEntries });
  }
  if (unavailableEntries.length > 0) {
    sections.push({ title: 'Unavailable Targets', entries: unavailableEntries });
  }
  return sections;
}

function formatEntryState(entry: DeviceInventoryEntry): string {
  if (entry.stateDetail && entry.stateDetail.trim().length > 0) {
    return `${entry.state}: ${entry.stateDetail.trim()}`;
  }
  return entry.state;
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
