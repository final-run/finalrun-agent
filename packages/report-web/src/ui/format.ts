// Formatting helpers copied verbatim from the legacy renderer so output
// is byte-identical.

export function formatLongDuration(durationMs: number | undefined): string {
  const ms = Number(durationMs || 0);
  if (ms <= 0) {
    return '0s';
  }

  const duration = Math.round(ms / 1000);
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatStepDuration(durationMs: number | undefined): string {
  const seconds = Number(durationMs || 0) / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

export function successRateTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 80) return 'success';
  if (rate >= 50) return 'warning';
  return 'danger';
}

export type SummaryTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

export function summaryIconStyle(tone: SummaryTone): string {
  if (tone === 'accent') return 'color: var(--accent); background: rgba(67, 24, 255, 0.1);';
  if (tone === 'success') return 'color: var(--success); background: rgba(5, 205, 153, 0.12);';
  if (tone === 'warning') return 'color: var(--warning); background: rgba(255, 146, 12, 0.12);';
  if (tone === 'danger') return 'color: var(--failure); background: rgba(238, 93, 80, 0.12);';
  return 'color: var(--text); background: var(--panel-alt);';
}

export type StatusPillStatus =
  | 'queued'
  | 'booting'
  | 'setting_up'
  | 'running'
  | 'success'
  | 'failure'
  | 'error'
  | 'aborted'
  | 'not_executed';

export function statusPillLabel(status: StatusPillStatus): string {
  if (status === 'queued') return 'Queued';
  if (status === 'booting') return 'Booting';
  if (status === 'setting_up') return 'Setting up';
  if (status === 'running') return 'Running';
  if (status === 'success') return 'Passed';
  if (status === 'aborted') return 'Aborted';
  if (status === 'failure') return 'Failed';
  if (status === 'error') return 'Error';
  return 'Not Executed';
}
