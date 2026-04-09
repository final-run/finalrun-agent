// Formats captured request entries as compact, colorized CLI lines.

import { colors as chalk } from './colors.js';
import type { CapturedEntry, TlsError } from './capture.js';

const METHOD_WIDTH = 7;
const STATUS_WIDTH = 5;
const DURATION_WIDTH = 8;
const SIZE_WIDTH = 10;
const TIME_WIDTH = 12; // HH:MM:SS.mmm

export function printEntry(entry: CapturedEntry, stream: NodeJS.WritableStream = process.stdout): void {
  const time = formatTime(entry.completedAt);
  const method = entry.method.toUpperCase().padEnd(METHOD_WIDTH);
  const status = String(entry.statusCode).padStart(STATUS_WIDTH);
  const duration = formatDuration(entry.durationMs).padStart(DURATION_WIDTH);
  const size = formatSize(entry.responseSize).padStart(SIZE_WIDTH);

  // Reserve space for metadata columns + spaces.
  const cols = (process.stdout as { columns?: number }).columns ?? 120;
  const fixedWidth = TIME_WIDTH + 2 + METHOD_WIDTH + 1 + STATUS_WIDTH + 1 + DURATION_WIDTH + 1 + SIZE_WIDTH;
  const urlWidth = Math.max(20, cols - fixedWidth - 4);
  const url = truncate(entry.url, urlWidth);

  const statusColor = colorForStatus(entry.statusCode);

  stream.write(
    `  ${chalk.dim(time)}  ${chalk.bold(method)} ${url.padEnd(urlWidth)} ${statusColor(status)} ${chalk.dim(duration)} ${chalk.dim(size)}\n`,
  );
}

export function printTlsError(err: TlsError, stream: NodeJS.WritableStream = process.stdout): void {
  const time = formatTime(new Date());
  const method = '!!!'.padEnd(METHOD_WIDTH);
  const host = err.hostname || 'unknown';
  const reason = tlsFailureMessage(err.failureCause);
  stream.write(
    `  ${chalk.dim(time)}  ${chalk.magenta(method)} ${chalk.magenta(host)}  ${chalk.magenta(reason)}\n`,
  );
}

function tlsFailureMessage(cause?: string): string {
  switch (cause) {
    case 'cert-rejected':
      return 'TLS rejected (app pins certificates)';
    case 'closed':
      return 'TLS closed (app may not trust user CAs)';
    case 'reset':
      return 'TLS reset (app may not trust user CAs)';
    default:
      return 'TLS failed';
  }
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 0) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '\u2026';
}

function colorForStatus(code: number): (text: string) => string {
  if (code >= 500) return chalk.red;
  if (code >= 400) return chalk.yellow;
  if (code >= 300) return chalk.cyan;
  if (code >= 200) return chalk.green;
  return chalk.white;
}
