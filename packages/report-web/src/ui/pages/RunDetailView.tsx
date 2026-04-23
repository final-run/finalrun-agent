'use client';

import { useEffect, useMemo } from 'react';
import type { ReportRunManifest } from '../../artifacts';
import { formatLongDuration } from '../format';
import { StatusPill } from '../components/StatusPill';
import { TintedPngIcon } from '../components/TintedPngIcon';
import { TestDetailSection } from '../components/TestDetailSection';
import { RunContextSummary } from '../components/RunContextSummary';
import { SegmentSummary } from '../components/SegmentSummary';
import { TEST_ICON_SRC, BACK_ARROW_ICON_SVG } from '../icons';
import {
  buildTestListItems,
  deriveReportTitle,
  formatRelativeTime,
  reportPayloadForController,
  summarizeTestItems,
  toReportViewModel,
  type ReportTestListItem,
} from '../viewModel';
import { initRunDetailController, selectTest, handlePrimaryBack } from '../client/runDetailController';

import '../styles/shared.css';
import '../styles/run-detail.css';

// Optional navigate prop — used by the back button when embedded inside an
// SPA (cloud). Consumer passes e.g. React Router's navigate; defaults to
// plain anchor navigation so standalone Next.js usage is unaffected.
export type NavigateFn = (href: string) => void;

// Optional initialTestId — preselects a specific test panel on mount. Lets
// cloud consumers deep-link to `/runs/:runId?test=:testId` without forking
// the component. Falls back to the first step of the first test, matching
// the OSS behavior.
export function RunDetailView({
  manifest: raw,
  navigate,
  initialTestId,
  backHref = '/',
}: {
  manifest: ReportRunManifest;
  navigate?: NavigateFn;
  initialTestId?: string;
  backHref?: string;
}) {
  const manifest = useMemo(() => toReportViewModel(raw), [raw]);
  const testItems = useMemo(() => buildTestListItems(manifest), [manifest]);
  const isSingleTest = testItems.length <= 1;
  const outcomeSummary = summarizeTestItems(testItems);
  const initialTest = testItems[0];
  const reportTitle = deriveReportTitle(manifest);
  const suiteLabel = reportTitle;
  const run = manifest.run;

  useEffect(() => {
    const cleanup = initRunDetailController(reportPayloadForController(manifest));
    // After the controller is bound, honor ?test=<id> (or the initialTestId
    // prop) by pre-selecting that panel. Works only for suite runs;
    // single-test runs already render the detail panel visible by default.
    const requested = initialTestId ?? readTestIdFromUrl();
    if (requested && !isSingleTest) {
      const exists = testItems.some((item) => item.input.testId === requested);
      if (exists) selectTest(requested);
    }
    return cleanup;
  }, [manifest, initialTestId, isSingleTest, testItems]);

  return (
    <div className="fr-report-ui">
      <main className="page report-page">
      <section className="report-header">
        <div className="report-header-main">
          <a
            className="back-button"
            id={isSingleTest ? 'report-back-button' : 'primary-back-button'}
            href={backHref}
            aria-label="Back to run history"
            title="Back to run history"
            onClick={(e) => {
              // For suite runs, primary back first clears the open test
              // panel before actually navigating. handlePrimaryBack returns
              // true when it did NOT consume the click.
              if (!isSingleTest && !handlePrimaryBack(e.nativeEvent)) {
                return;
              }
              // SPA navigation when a navigate fn is provided; otherwise
              // let the browser follow the href.
              if (navigate) {
                e.preventDefault();
                navigate(backHref);
              }
            }}
            dangerouslySetInnerHTML={{ __html: BACK_ARROW_ICON_SVG }}
          />
          <div>
            <div className="report-eyebrow">Run history</div>
            <h1 className="report-title">{reportTitle}</h1>
            <p className="report-subtitle">
              {run.runId} · Completed {formatRelativeTime(run.completedAt)} ago
            </p>
          </div>
        </div>
        <StatusPill status={run.success ? 'success' : 'failure'} />
      </section>

      {isSingleTest ? (
        <SingleTestPage manifest={manifest} item={initialTest} />
      ) : (
        <SuiteRunPage
          manifest={manifest}
          items={testItems}
          summary={outcomeSummary}
          suiteLabel={suiteLabel}
        />
      )}
    </main>
    </div>
  );
}

function SingleTestPage({
  manifest,
  item,
}: {
  manifest: ReportRunManifest;
  item: ReportTestListItem | undefined;
}) {
  if (!item) {
    return (
      <section className="overview-panel">
        <div className="overview-panel-body">
          <div className="empty-panel">No test details were recorded for this run.</div>
        </div>
      </section>
    );
  }
  return <TestDetailSection item={item} visible={true} manifest={manifest} />;
}

function SuiteRunPage({
  manifest,
  items,
  summary,
  suiteLabel,
}: {
  manifest: ReportRunManifest;
  items: ReportTestListItem[];
  summary: ReturnType<typeof summarizeTestItems>;
  suiteLabel: string;
}) {
  return (
    <>
      <section id="suite-overview" className="overview-grid">
        <section className="overview-panel">
          <div className="overview-panel-body">
            <h2 className="overview-title">Run summary</h2>
            <p className="overview-subtitle">
              Completed suite-level view based on the locally captured report artifacts.
            </p>
            <div className="segment-summary">
              <div className="segment-shell">
                <SegmentSummary summary={summary} />
              </div>
              <div className="metric-cards">
                <div className="metric-card">
                  <div className="metric-value">
                    {summary.success}/{summary.total}
                  </div>
                  <div className="metric-label">Tests passed</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value">{formatLongDuration(manifest.run.durationMs)}</div>
                  <div className="metric-label">Run duration</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overview-panel">
          <div className="overview-panel-body">
            <h2 className="overview-title">Run Context</h2>
            <p className="overview-subtitle">Inputs and environment captured for this report.</p>
            <RunContextSummary manifest={manifest} />
          </div>
        </section>

        <section className="suite-list-shell">
          <h2>Executed tests</h2>
          <p>Select a test to inspect the detailed step-by-step report.</p>
          <table>
            <thead>
              <tr>
                <th>TEST NAME</th>
                <th>APPS</th>
                <th>DURATION</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <SuiteRow key={item.input.testId!} item={item} appLabel={manifest.run.app.label} />
              ))}
            </tbody>
          </table>
        </section>
      </section>

      {items.map((item) => (
        <TestDetailSection
          key={item.input.testId!}
          item={item}
          visible={false}
          parentLabel={suiteLabel}
          manifest={manifest}
        />
      ))}
    </>
  );
}

// Reads ?test=<id> from window.location.search. Returns undefined if not
// present or in a non-browser environment (SSR). No URL history mutation
// here — that would couple the library to a specific router.
function readTestIdFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  return params.get('test') ?? undefined;
}

function SuiteRow({ item, appLabel }: { item: ReportTestListItem; appLabel: string }) {
  return (
    <tr className="suite-row" onClick={() => selectTest(item.input.testId!)}>
      <td>
        <div className="run-name-cell">
          <TintedPngIcon src={TEST_ICON_SRC} />
          <div className="run-name-copy">
            <span className="run-name-link">{item.input.name}</span>
            <div className="run-secondary">{item.input.relativePath ?? ''}</div>
          </div>
        </div>
      </td>
      <td>{appLabel}</td>
      <td>{item.durationLabel}</td>
      <td>
        <StatusPill status={item.status} />
      </td>
    </tr>
  );
}
