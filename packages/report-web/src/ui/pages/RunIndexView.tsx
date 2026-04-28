'use client';

import type React from 'react';
import type { ReportIndexRunRecord, ReportIndexViewModel } from '../../artifacts';
import { buildRunRoute } from '../routes';
import { SummaryCard } from '../components/SummaryCard';
import { StatusPill } from '../components/StatusPill';
import { TintedPngIcon } from '../components/TintedPngIcon';
import { LOCAL_ICON_SRC, TEST_ICON_SRC, TEST_SUITE_ICON_SRC } from '../icons';
import {
  CHECK_CIRCLE_ICON_NODE,
  PLAY_CIRCLE_ICON_NODE,
  TIMER_ICON_NODE,
} from '../iconNodes';
import { formatLongDuration, successRateTone } from '../format';

import '../styles/shared.css';
import '../styles/run-index.css';

// Optional navigate prop. When set, row clicks go through the consumer's
// router (e.g. React Router's navigate()) instead of a full-page reload.
// Defaults to window.location.href for standalone Next.js usage.
export type NavigateFn = (href: string) => void;

export function RunIndexView({
  index,
  navigate,
}: {
  index: ReportIndexViewModel;
  navigate?: NavigateFn;
}) {
  return (
    <div className="fr-report-ui">
      <main className="page history-list-page">
      <section className="history-page-header">
        <div>
          <h1>Test Runs</h1>
          <p>Local FinalRun run history for the current workspace.</p>
        </div>
      </section>

      <section className="summary-grid">
        <SummaryCard
          label="Total Runs"
          value={String(index.summary.totalRuns)}
          tone="accent"
          icon={PLAY_CIRCLE_ICON_NODE}
        />
        <SummaryCard
          label="Test Success Rate"
          value={`${index.summary.totalSuccessRate.toFixed(1)}%`}
          tone={successRateTone(index.summary.totalSuccessRate)}
          icon={CHECK_CIRCLE_ICON_NODE}
        />
        <SummaryCard
          label="Total time saved"
          value={formatLongDuration(index.summary.totalDurationMs)}
          tone="neutral"
          icon={TIMER_ICON_NODE}
        />
      </section>

      <section className="runs-shell">
        <div className="runs-shell-header">
          <h2>Run history</h2>
          <p>Open a completed run to inspect the suite or individual test report.</p>
        </div>
        {index.runs.length === 0 ? (
          <div className="empty-state">No FinalRun reports found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>TEST NAME</th>
                <th>APPS</th>
                <th>DURATION</th>
                <th>STATUS</th>
                <th>RESULT</th>
                <th>RAN ON</th>
                <th>Triggered From</th>
              </tr>
            </thead>
            <tbody>
              {index.runs.map((run) => (
                <RunIndexRow key={run.runId} run={run} navigate={navigate} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
    </div>
  );
}

function RunIndexRow({ run, navigate }: { run: ReportIndexRunRecord; navigate?: NavigateFn }) {
  const resultLabel =
    run.passedCount + run.failedCount === 0 ? 'NA' : `${run.passedCount} / ${run.selectedTestCount}`;
  const href = buildRunRoute(run.runId);
  const iconSrc = run.displayKind === 'suite' ? TEST_SUITE_ICON_SRC : TEST_ICON_SRC;

  const onRowClick = () => {
    if (navigate) navigate(href);
    else window.location.href = href;
  };

  const onLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!navigate) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(href);
  };

  return (
    <tr className="history-row" onClick={onRowClick}>
      <td>
        <div className="run-name-cell">
          <TintedPngIcon src={iconSrc} />
          <div className="run-name-copy">
            <a className="run-name-link" href={href} onClick={onLinkClick}>{run.displayName}</a>
            <div className="run-secondary">{run.runId}</div>
          </div>
        </div>
      </td>
      <td>{run.appLabel}</td>
      <td>{run.durationMs > 0 ? formatLongDuration(run.durationMs) : 'NA'}</td>
      <td>
        <StatusPill status={run.success ? 'success' : 'failure'} />
      </td>
      <td>{resultLabel}</td>
      <td>
        <span className="run-on-badge">
          <img className="png-icon" src={LOCAL_ICON_SRC} alt="" />
          <span>Local</span>
        </span>
      </td>
      <td>{run.triggeredFrom}</td>
    </tr>
  );
}
