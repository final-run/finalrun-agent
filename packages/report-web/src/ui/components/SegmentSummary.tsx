import type { OutcomeSummary } from '../viewModel';

// Mirrors renderSummarySegments() — proportional bar + legend with percentages.
// Legend dots use inline `background` to match the legacy emitted string exactly
// (even though equivalent CSS rules exist on .segment.{name}).

const SEGMENTS = [
  { label: 'Success', className: 'success', bg: 'var(--success)' },
  { label: 'Aborted', className: 'aborted', bg: 'var(--aborted)' },
  { label: 'Failure', className: 'failure', bg: 'var(--failure)' },
  { label: 'Error', className: 'error', bg: 'var(--warning)' },
  { label: 'Not Executed', className: 'not-executed', bg: 'var(--icon)' },
] as const;

export function SegmentSummary({ summary }: { summary: OutcomeSummary }) {
  const entries = SEGMENTS.map((s) => ({
    ...s,
    count: countFor(s.className, summary),
  }));

  return (
    <>
      <div className="segment-bar">
        {entries
          .filter((e) => e.count > 0)
          .map((e) => {
            const width = summary.total === 0 ? 0 : (e.count / summary.total) * 100;
            return (
              <div
                key={e.className}
                className={`segment ${e.className}`}
                style={{ width: `${width.toFixed(2)}%` }}
              />
            );
          })}
      </div>
      <div className="segment-legend">
        {entries.map((e) => {
          const percent = summary.total === 0 ? 0 : Math.round((e.count / summary.total) * 100);
          return (
            <span key={e.className} className="segment-legend-item">
              <span
                className={`segment-legend-dot ${e.className}`}
                style={{ background: e.bg }}
              />
              <span>
                {e.label} - {percent}%
              </span>
            </span>
          );
        })}
      </div>
    </>
  );
}

function countFor(name: string, summary: OutcomeSummary): number {
  if (name === 'success') return summary.success;
  if (name === 'aborted') return summary.aborted;
  if (name === 'failure') return summary.failure;
  if (name === 'error') return summary.error;
  return summary.notExecuted;
}
