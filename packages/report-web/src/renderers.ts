import type {
  RunManifestRecord as SharedRunManifestRecord,
  RunManifestStepRecord,
  RunTargetRecord,
} from '@finalrun/common';
import type {
  ReportIndexRunRecord,
  ReportIndexViewModel,
  ReportManifestSelectedSpecRecord,
  ReportManifestSpecRecord,
  ReportRunManifestRecord,
} from './artifacts';
import { buildArtifactRoute, buildRunRoute } from './artifacts';

function svgDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const TEST_ICON_SRC = svgDataUri(
  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.023 6.44581L10.7376 0.160415C10.6334 0.0562284 10.4916 -0.00178609 10.3433 -0.000865207C10.195 5.56883e-05 10.0525 0.0598365 9.94698 0.165326C9.84149 0.270815 9.78171 0.413371 9.78079 0.561635C9.77987 0.709898 9.83788 0.851723 9.94207 0.95591L10.2838 1.29768L1.18337 10.3981C0.432289 11.1492 0.00665178 12.1642 9.49964e-05 13.2199C-0.00646187 14.2755 0.4066 15.2853 1.14841 16.0271C1.89022 16.7689 2.90002 17.182 3.95565 17.1754C5.01129 17.1689 6.02629 16.7432 6.77737 15.9921L15.8778 6.89168L16.2275 7.2413C16.3316 7.34549 16.4735 7.40351 16.6217 7.40258C16.77 7.40166 16.9126 7.34188 17.018 7.23639C17.1235 7.1309 17.1833 6.98835 17.1842 6.84008C17.1852 6.69182 17.1271 6.55 17.023 6.44581ZM13.1471 8.0589C12.6386 8.15099 10.8743 8.36749 9.64093 7.43637C8.84698 6.83875 7.93683 6.41188 6.96677 6.18217L11.0675 2.08139L15.0961 6.10993L13.1471 8.0589Z" fill="#707EAE"/></svg>',
);

const TEST_SUITE_ICON_SRC = svgDataUri(
  '<svg width="18" height="17" viewBox="0 0 18 17" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.978 0.621055H11.4888C11.6596 0.621055 11.7993 0.484423 11.7993 0.310527C11.7993 0.139736 11.6596 0 11.4888 0H5.90248C5.72858 0 5.59195 0.139736 5.59195 0.310527C5.59195 0.484423 5.72858 0.621055 5.90248 0.621055H7.03434V5.14551C7.03434 5.21383 7.01261 5.27904 6.97224 5.33183L4.85449 8.18868C5.80782 7.92162 7.30771 7.75394 8.84156 8.58616C10.5402 9.50842 12.2449 9.01157 12.9405 8.73521L10.4189 5.33183C10.3786 5.27904 10.3568 5.21383 10.3568 5.14551V0.621055H10.978Z" fill="#707EAE"/><path d="M13.3226 9.24894C12.9189 9.42905 12.0526 9.74889 10.9843 9.74889C10.239 9.74889 9.39748 9.59362 8.54656 9.13403C6.52818 8.04098 4.51895 8.9353 4.17434 9.10609L4.17123 9.10919L0.233844 14.4254C-0.0363199 14.7887 -0.0735832 15.2483 0.128265 15.652C0.333203 16.0557 0.724477 16.2979 1.17474 16.2979H16.2168C16.667 16.2979 17.0583 16.0557 17.2633 15.652C17.4651 15.2483 17.4278 14.7887 17.1577 14.4254L13.3226 9.24894ZM4.22104 11.6555L1.98524 14.6739C1.92624 14.7546 1.83309 14.7981 1.73682 14.7981C1.67161 14.7981 1.6064 14.7795 1.55051 14.736C1.41387 14.6335 1.38593 14.441 1.4884 14.3012L3.7242 11.286C3.82667 11.1463 4.0192 11.1183 4.15894 11.2208C4.29557 11.3233 4.32351 11.5157 4.22104 11.6555ZM5.23337 10.286L4.98185 10.6307C4.91974 10.7146 4.82658 10.758 4.73033 10.758C4.66512 10.758 4.60301 10.7394 4.54711 10.6959C4.40738 10.5966 4.37943 10.4009 4.4819 10.2643L4.73653 9.91961C4.83589 9.77987 5.03153 9.75192 5.16816 9.8544C5.3079 9.95377 5.33584 10.1494 5.23337 10.286Z" fill="#707EAE"/></svg>',
);

const LOCAL_ICON_SRC = svgDataUri(
  '<svg width="65" height="48" viewBox="0 0 65 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="63" height="42" rx="8" stroke="#707EAE" stroke-width="2"/><line x1="16" y1="47" x2="52" y2="47" stroke="#707EAE" stroke-width="2" stroke-linecap="round"/></svg>',
);

type SpecOutcomeStatus = 'success' | 'failure' | 'error' | 'not_executed';

interface ReportSpecListItem {
  input: ReportManifestSelectedSpecRecord;
  executed?: ReportManifestSpecRecord;
  status: SpecOutcomeStatus;
  durationLabel: string;
}

interface OutcomeSummary {
  total: number;
  success: number;
  failure: number;
  error: number;
  notExecuted: number;
}

export function renderRunIndexHtml(index: ReportIndexViewModel): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinalRun Reports</title>
  ${renderFontLinks()}
  <style>
    ${renderSharedCss()}

    .history-list-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .history-page-header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .history-page-header h1 {
      margin: 0;
      font-size: 32px;
      line-height: 1.1;
      letter-spacing: -0.04em;
    }

    .history-page-header p {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .summary-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }

    .summary-card-icon {
      width: 46px;
      height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      flex: 0 0 auto;
    }

    .summary-card-icon svg {
      width: 22px;
      height: 22px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .summary-card-label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    .summary-card-value {
      margin-top: 4px;
      color: var(--text);
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }

    .runs-shell {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .runs-shell-header {
      padding: 24px 26px 18px;
      border-bottom: 1px solid var(--border-light);
    }

    .runs-shell-header h2 {
      margin: 0;
      font-size: 18px;
    }

    .runs-shell-header p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      text-align: left;
      vertical-align: middle;
      padding: 18px 20px;
      border-top: 1px solid var(--border-light);
      font-size: 14px;
    }

    th {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }

    .history-row {
      cursor: pointer;
      transition: background 0.18s ease;
    }

    .history-row:hover {
      background: var(--selected);
    }

    .run-name-cell {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 260px;
    }

    .png-icon {
      width: 18px;
      height: 18px;
      object-fit: contain;
      flex: 0 0 auto;
    }

    .tinted-png-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      display: inline-block;
      background-color: #707EAE;
      -webkit-mask-image: var(--icon-mask);
      mask-image: var(--icon-mask);
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      -webkit-mask-position: center;
      mask-position: center;
      -webkit-mask-size: contain;
      mask-size: contain;
    }

    .run-name-copy {
      min-width: 0;
    }

    .run-name-link {
      color: var(--text);
      font-weight: 700;
      text-decoration: none;
    }

    .run-name-link:hover {
      text-decoration: underline;
    }

    .run-secondary {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .app-badge,
    .run-on-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text);
      font-weight: 600;
    }

    .empty-state {
      padding: 36px 28px;
      color: var(--muted);
      font-size: 15px;
    }

    @media (max-width: 1100px) {
      .runs-shell {
        overflow-x: auto;
      }
    }
  </style>
</head>
<body>
  <main class="page history-list-page">
    <section class="history-page-header">
      <div>
        <h1>Test Runs</h1>
        <p>Local FinalRun run history for the current workspace.</p>
      </div>
    </section>

    <section class="summary-grid">
      ${renderSummaryCard('Total Runs', String(index.summary.totalRuns), 'accent', renderPlayCircleIconSvg())}
      ${renderSummaryCard('Test Success Rate', `${index.summary.totalSuccessRate.toFixed(1)}%`, successRateTone(index.summary.totalSuccessRate), renderCheckCircleIconSvg())}
      ${renderSummaryCard('Total time saved', formatLongDuration(index.summary.totalDurationMs), 'neutral', renderTimerIconSvg())}
    </section>

    <section class="runs-shell">
      <div class="runs-shell-header">
        <h2>Run history</h2>
        <p>Open a completed run to inspect the suite or individual test report.</p>
      </div>
      ${index.runs.length === 0
        ? '<div class="empty-state">No FinalRun reports found.</div>'
        : `
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
          ${index.runs.map((run) => renderRunIndexRow(run)).join('')}
        </tbody>
      </table>
      `}
    </section>
  </main>
</body>
</html>`;
}

export function renderRunHtml(manifest: ReportRunManifestRecord): string {
  const view = toReportViewModel(manifest);
  const run = view.run;
  const specItems = buildSpecListItems(view);
  const isSingleSpec = specItems.length <= 1;
  const outcomeSummary = summarizeSpecItems(specItems);
  const initialSpec = specItems[0];
  const reportTitle = deriveReportTitle(view);
  const reportPayload = JSON.stringify(stripSnapshotYamlText(view)).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(reportTitle)}</title>
  ${renderFontLinks()}
  <style>
    ${renderSharedCss()}

    .report-page {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .report-header-main {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      min-width: 0;
    }

    .back-button {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      text-decoration: none;
      box-shadow: var(--shadow);
      flex: 0 0 auto;
    }

    .back-button svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .report-eyebrow {
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
      letter-spacing: -0.02em;
    }

    .report-title {
      margin: 4px 0 0;
      color: var(--text);
      font-size: 32px;
      font-weight: 600;
      line-height: 1.08;
      letter-spacing: -0.04em;
    }

    .report-subtitle {
      margin: 10px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .overview-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }

    .overview-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .overview-panel-body {
      padding: 24px;
    }

    .overview-title {
      margin: 0;
      color: var(--text);
      font-size: 18px;
      font-weight: 700;
    }

    .overview-subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .segment-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 24px;
    }

    .segment-shell {
      flex: 1 1 420px;
      min-width: 280px;
    }

    .segment-bar {
      width: 100%;
      height: 48px;
      display: flex;
      border-radius: 12px;
      overflow: hidden;
      background: var(--panel-alt);
    }

    .segment {
      height: 100%;
    }

    .segment.success { background: var(--success); }
    .segment.failure { background: var(--failure); }
    .segment.error { background: var(--warning); }
    .segment.not-executed { background: var(--icon); }

    .segment-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 18px;
      margin-top: 14px;
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
    }

    .segment-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .segment-legend-dot {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      flex: 0 0 auto;
    }

    .metric-cards {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .metric-card {
      min-width: 160px;
      padding: 20px 22px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: white;
    }

    .metric-value {
      color: var(--text);
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }

    .metric-label {
      margin-top: 6px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
    }

    .run-context-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px 24px;
    }

    .context-summary-item {
      min-width: 0;
      padding: 2px 0;
    }

    .context-summary-label {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 6px;
    }

    .context-summary-value {
      color: var(--text);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.5;
      word-break: break-word;
    }

    .suite-list-shell {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .suite-list-shell h2 {
      margin: 0;
      padding: 24px 24px 10px;
      font-size: 18px;
    }

    .suite-list-shell p {
      margin: 0;
      padding: 0 24px 18px;
      color: var(--muted);
      font-size: 14px;
    }

    .suite-list-shell table {
      width: 100%;
      border-collapse: collapse;
    }

    .suite-list-shell th,
    .suite-list-shell td {
      padding: 18px 20px;
      border-top: 1px solid var(--border-light);
      text-align: left;
      vertical-align: middle;
      font-size: 14px;
    }

    .suite-list-shell th {
      color: var(--muted);
      font-size: 13px;
      font-weight: 500;
    }

    .suite-row {
      cursor: pointer;
      transition: background 0.18s ease;
    }

    .suite-row:hover {
      background: var(--selected);
    }

    .detail-shell {
      display: none;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .detail-shell.is-visible {
      display: block;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
      padding: 24px 24px 0;
    }

    .detail-header-main {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      min-width: 0;
    }

    .detail-header-copy {
      min-width: 0;
    }

    .detail-header-copy h2 {
      margin: 0;
      color: var(--text);
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.03em;
    }

    .detail-header-copy p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .detail-meta {
      margin-top: 18px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      padding: 0 24px 24px;
    }

    .detail-meta-card {
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel-alt);
    }

    .detail-meta-card strong {
      display: block;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .detail-meta-card span {
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.45;
    }

    .detail-section-shell {
      padding: 0 24px 24px;
    }

    .detail-section-card {
      padding: 18px 20px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: white;
    }

    .detail-section-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .detail-section-copy {
      min-width: 0;
    }

    .detail-section-title {
      margin: 0;
      color: var(--text);
      font-size: 18px;
      font-weight: 700;
    }

    .detail-section-subtitle {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }

    .detail-section-link {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .yaml-shell {
      padding: 16px;
      border: 1px solid var(--border-light);
      border-radius: 14px;
      background: var(--panel-alt);
    }

    .yaml-block {
      margin: 0;
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace;
      font-size: 13px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
    }

    .analysis-card.success {
      background: rgba(5, 205, 153, 0.08);
      border-color: rgba(5, 205, 153, 0.22);
    }

    .analysis-card.failure {
      background: rgba(238, 93, 80, 0.08);
      border-color: rgba(238, 93, 80, 0.22);
    }

    .analysis-card.error {
      background: rgba(255, 146, 12, 0.10);
      border-color: rgba(255, 146, 12, 0.24);
    }

    .analysis-card.not_executed {
      background: rgba(112, 126, 174, 0.08);
      border-color: rgba(112, 126, 174, 0.2);
    }

    .analysis-card.success .detail-section-title {
      color: var(--success);
    }

    .analysis-card.failure .detail-section-title {
      color: var(--failure);
    }

    .analysis-card.error .detail-section-title {
      color: var(--warning);
    }

    .analysis-card.not_executed .detail-section-title {
      color: var(--muted);
    }

    .analysis-copy {
      color: var(--text);
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(320px, 0.95fr) minmax(420px, 1.05fr);
      height: clamp(520px, calc(100vh - 48px), 760px);
      border-top: 1px solid var(--border-light);
      align-items: stretch;
      overflow: hidden;
    }

    .timeline-panel {
      padding: 22px;
      border-right: 1px solid var(--border-light);
      background: white;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
      overflow: hidden;
    }

    .detail-panel {
      padding: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(244,247,254,0.96) 100%);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .timeline-scroll {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding-right: 6px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-label {
      margin: 0 0 14px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .step-button {
      width: 100%;
      margin: 0;
      padding: 14px;
      border: 1px solid transparent;
      border-radius: 14px;
      background: transparent;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.18s ease, background 0.18s ease;
    }

    .step-button:hover {
      background: var(--selected);
      border-color: rgba(67, 24, 255, 0.14);
    }

    .step-button.is-selected {
      background: var(--selected);
      border-color: rgba(67, 24, 255, 0.24);
    }

    .step-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    }

    .step-copy {
      min-width: 0;
    }

    .step-icon {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      color: white;
      font-size: 14px;
      font-weight: 700;
    }

    .step-icon.success { background: var(--success); }
    .step-icon.failure { background: var(--failure); }
    .step-icon.error { background: var(--warning); }

    .step-title {
      color: var(--text);
      font-weight: 700;
      line-height: 1.45;
    }

    .step-expanded {
      display: none;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(188, 197, 225, 0.65);
    }

    .step-button.is-selected .step-expanded {
      display: block;
    }

    .step-reasoning-copy {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .duration-chip {
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--panel-alt);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .empty-panel {
      padding: 24px;
      border: 1px dashed rgba(188, 197, 225, 0.9);
      border-radius: 16px;
      background: rgba(244, 247, 254, 0.9);
      color: var(--muted);
      line-height: 1.6;
    }

    .media-shell {
      width: min(100%, clamp(220px, 16vw, 260px));
      margin: 0 auto 12px;
      border-radius: 18px;
      overflow: hidden;
      background: #111827;
      display: grid;
      place-items: center;
      border: 1px solid rgba(148, 163, 184, 0.28);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    }

    .recording-shell {
      aspect-ratio: var(--recording-aspect-ratio, 9 / 19.5);
    }

    .media-shell img,
    .recording-shell video {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: contain;
      background: #020617;
    }

    .empty-shot {
      padding: 18px;
      color: #d9e0ef;
      text-align: center;
      font-size: 14px;
      line-height: 1.5;
    }

    .recording-controls {
      width: min(100%, 380px);
      margin: -4px auto 12px;
      padding: 10px 12px;
      border: 1px solid rgba(224, 229, 242, 0.9);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(10px);
    }

    .recording-control-row {
      display: grid;
      grid-template-columns: 32px 5ch minmax(0, 1fr) 5ch 56px 28px;
      align-items: center;
      gap: 8px;
    }

    .recording-icon-button {
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(224, 229, 242, 0.9);
      border-radius: 10px;
      padding: 0;
      background: rgba(244, 247, 254, 0.95);
      color: var(--text);
      cursor: pointer;
    }

    .recording-icon-button.primary {
      background: rgba(67, 24, 255, 0.08);
      border-color: rgba(67, 24, 255, 0.14);
      color: var(--accent);
    }

    .recording-icon-button svg {
      width: 14px;
      height: 14px;
      display: block;
      fill: currentColor;
    }

    .recording-icon-button[data-role="recording-fullscreen"] {
      width: 28px;
      height: 28px;
      border-color: transparent;
      background: transparent;
      color: var(--icon);
    }

    .recording-icon-button:disabled,
    .recording-timeline:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .recording-timeline {
      width: 100%;
      margin: 0;
      accent-color: var(--accent);
      min-width: 0;
    }

    .recording-time {
      width: 5ch;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      text-align: center;
      white-space: nowrap;
    }

    .recording-speed {
      width: 56px;
      height: 28px;
      border: 1px solid rgba(224, 229, 242, 0.9);
      border-radius: 9px;
      padding: 0 8px;
      background: rgba(244, 247, 254, 0.95);
      color: var(--muted);
      font: inherit;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .recording-speed:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 980px) {
      .workspace {
        grid-template-columns: 1fr;
        height: auto;
      }

      .timeline-panel {
        border-right: 0;
        border-bottom: 1px solid var(--border-light);
        overflow: visible;
      }

      .timeline-scroll {
        overflow: visible;
        padding-right: 0;
      }
    }
  </style>
</head>
<body>
  <main class="page report-page">
    <section class="report-header">
      <div class="report-header-main">
        <a
          class="back-button"
          id="${isSingleSpec ? 'report-back-button' : 'primary-back-button'}"
          href="/"
          aria-label="Back to run history"
          title="Back to run history"
          ${isSingleSpec ? '' : 'onclick="return handlePrimaryBack(event)"'}
        >
          ${renderBackArrowIconSvg()}
        </a>
        <div>
          <div class="report-eyebrow">Run history</div>
          <h1 class="report-title">${escapeHtml(reportTitle)}</h1>
          <p class="report-subtitle">${escapeHtml(run.runId)} · Completed ${escapeHtml(formatRelativeTime(run.completedAt))} ago</p>
        </div>
      </div>
      ${renderStatusPill(run.success ? 'success' : 'failure')}
    </section>

    ${isSingleSpec
      ? renderSingleSpecPage(view, initialSpec)
      : renderSuiteRunPage(view, specItems, outcomeSummary)}
  </main>

  <script id="finalrun-report-data" type="application/json">${reportPayload}</script>
  <script>
    const reportPayload = JSON.parse(document.getElementById('finalrun-report-data').textContent);
    const specMap = Object.fromEntries(reportPayload.specs.map((spec) => [spec.specId, spec]));

    function clearSpecSelection() {
      const overview = document.getElementById('suite-overview');
      if (overview) {
        overview.style.display = 'block';
      }
      for (const panel of document.querySelectorAll('[data-spec-panel]')) {
        panel.classList.remove('is-visible');
      }
      updatePrimaryBackButton();
    }

    function selectSpec(specId) {
      const overview = document.getElementById('suite-overview');
      if (overview) {
        overview.style.display = 'none';
      }
      for (const panel of document.querySelectorAll('[data-spec-panel]')) {
        panel.classList.toggle('is-visible', panel.dataset.specPanel === specId);
      }
      if (specMap[specId] && specMap[specId].steps.length > 0) {
        selectStep(specId, 0);
      }
      updatePrimaryBackButton();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function hasVisibleSpecPanel() {
      for (const panel of document.querySelectorAll('[data-spec-panel]')) {
        if (panel.classList.contains('is-visible')) {
          return true;
        }
      }
      return false;
    }

    function updatePrimaryBackButton() {
      const button = document.getElementById('primary-back-button');
      if (!button) {
        return;
      }
      const label = hasVisibleSpecPanel() ? 'Back to suite overview' : 'Back to run history';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }

    function handlePrimaryBack(event) {
      if (!hasVisibleSpecPanel()) {
        return true;
      }
      event.preventDefault();
      clearSpecSelection();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }

    function selectStep(specId, stepIndex) {
      const spec = specMap[specId];
      const step = spec?.steps?.[stepIndex];
      const container = document.querySelector('[data-step-detail="' + specId + '"]');
      if (!container || !step) {
        return;
      }

      setSelectedStep(specId, stepIndex);
      syncRecording(container, spec, step);
    }

    function setSelectedStep(specId, stepIndex) {
      for (const button of document.querySelectorAll('[data-spec-id="' + specId + '"][data-step-index]')) {
        button.classList.toggle('is-selected', Number(button.dataset.stepIndex) === stepIndex);
      }
    }

    function selectNearestStepForTime(specId, targetSeconds) {
      const spec = specMap[specId];
      if (!spec) {
        return;
      }

      const nearestStepIndex = findNearestStepIndex(spec, targetSeconds);
      if (nearestStepIndex === null) {
        return;
      }

      const step = spec.steps[nearestStepIndex];
      const container = document.querySelector('[data-step-detail="' + specId + '"]');
      if (!container || !step) {
        return;
      }

      setSelectedStep(specId, nearestStepIndex);
      updateRecordingCaption(container, spec, step, targetSeconds);
    }

    function findNearestStepIndex(spec, targetSeconds) {
      let nearestIndex = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const [index, step] of spec.steps.entries()) {
        if (typeof step.videoOffsetMs !== 'number') {
          continue;
        }

        const stepSeconds = Math.max(0, step.videoOffsetMs / 1000);
        const distance = Math.abs(stepSeconds - targetSeconds);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }

      return nearestIndex;
    }

    function formatVideoClock(totalSeconds) {
      const wholeSeconds = Math.floor(Math.max(0, Number(totalSeconds || 0)));
      const minutesPart = Math.floor(wholeSeconds / 60);
      const secondsPart = wholeSeconds % 60;
      return String(minutesPart).padStart(2, '0') + ':' + String(secondsPart).padStart(2, '0');
    }

    function syncRecordingShell(container, video) {
      const shell = container.querySelector('.recording-shell');
      if (!shell) {
        return;
      }
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        shell.style.setProperty('--recording-aspect-ratio', String(video.videoWidth) + ' / ' + String(video.videoHeight));
        return;
      }
      shell.style.removeProperty('--recording-aspect-ratio');
    }

    function ensureRecordingControls(container) {
      const video = container.querySelector('[data-role="recording-video"]');
      const seekbar = container.querySelector('[data-role="recording-seekbar"]');
      const playPause = container.querySelector('[data-role="recording-playpause"]');
      const speed = container.querySelector('[data-role="recording-speed"]');
      const fullscreen = container.querySelector('[data-role="recording-fullscreen"]');
      if (!video || !seekbar || !playPause || !fullscreen || video.dataset.seekbarBound === '1') {
        return;
      }

      const syncControls = () => {
        syncRecordingShell(container, video);
        updateRecordingControls(container, video);
      };

      const applySeek = () => {
        const nextTime = Number(seekbar.value || 0);
        if (!Number.isFinite(nextTime)) {
          return;
        }
        if (typeof video.fastSeek === 'function') {
          video.fastSeek(nextTime);
        } else {
          video.currentTime = nextTime;
        }
        syncControls();
        const specId = container.getAttribute('data-step-detail');
        if (specId) {
          selectNearestStepForTime(specId, nextTime);
        }
      };

      const togglePlayback = async () => {
        try {
          if (video.paused || video.ended) {
            await video.play();
          } else {
            video.pause();
          }
        } catch {
          // Ignore browser playback restrictions and keep the UI state stable.
        }
        syncControls();
      };

      const toggleFullscreen = async () => {
        const shell = container.querySelector('.recording-shell');
        const target = shell || video;
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
          } else if (typeof target.requestFullscreen === 'function') {
            await target.requestFullscreen();
          } else if (typeof video.webkitEnterFullscreen === 'function') {
            video.webkitEnterFullscreen();
          }
        } catch {
          // Ignore fullscreen API failures and keep the local controls responsive.
        }
      };

      const applyPlaybackRate = () => {
        if (!speed) {
          return;
        }
        const nextRate = Number(speed.value || 2);
        if (!Number.isFinite(nextRate) || nextRate <= 0) {
          return;
        }
        video.playbackRate = nextRate;
        syncControls();
      };

      video.addEventListener('loadedmetadata', syncControls);
      video.addEventListener('durationchange', syncControls);
      video.addEventListener('timeupdate', syncControls);
      video.addEventListener('play', syncControls);
      video.addEventListener('pause', syncControls);
      video.addEventListener('ended', syncControls);
      video.addEventListener('emptied', syncControls);
      video.addEventListener('ratechange', syncControls);
      seekbar.addEventListener('input', applySeek);
      seekbar.addEventListener('change', applySeek);
      playPause.addEventListener('click', togglePlayback);
      if (speed) {
        speed.value = speed.value || '2';
        video.playbackRate = Number(speed.value || 2);
        speed.addEventListener('change', applyPlaybackRate);
      }
      fullscreen.addEventListener('click', toggleFullscreen);
      video.dataset.seekbarBound = '1';
    }

    function updateRecordingControls(container, video) {
      const seekbar = container.querySelector('[data-role="recording-seekbar"]');
      const current = container.querySelector('[data-role="recording-current"]');
      const duration = container.querySelector('[data-role="recording-duration"]');
      const playPause = container.querySelector('[data-role="recording-playpause"]');
      const speed = container.querySelector('[data-role="recording-speed"]');
      const fullscreen = container.querySelector('[data-role="recording-fullscreen"]');
      if (!seekbar || !current || !duration || !playPause || !fullscreen) {
        return;
      }

      const totalSeconds = Number.isFinite(video.duration) ? Math.max(video.duration, 0) : 0;
      const currentSeconds = Number.isFinite(video.currentTime) ? Math.max(video.currentTime, 0) : 0;
      seekbar.max = String(totalSeconds);
      seekbar.value = String(Math.min(currentSeconds, totalSeconds || currentSeconds));
      seekbar.disabled = totalSeconds <= 0;
      current.textContent = formatVideoClock(currentSeconds);
      duration.textContent = totalSeconds > 0 ? formatVideoClock(totalSeconds) : '--:--';
      playPause.innerHTML = video.paused || video.ended
        ? '${escapeJs(renderPlayIconSvg())}'
        : '${escapeJs(renderPauseIconSvg())}';
      playPause.setAttribute('aria-label', video.paused || video.ended ? 'Play recording' : 'Pause recording');
      playPause.setAttribute('title', video.paused || video.ended ? 'Play recording' : 'Pause recording');
      if (speed) {
        speed.disabled = !(video.currentSrc || video.src);
      }
      fullscreen.innerHTML = '${escapeJs(renderFullscreenIconSvg())}';
      fullscreen.setAttribute('title', 'Open recording fullscreen');
      fullscreen.disabled = !(video.currentSrc || video.src);
    }

    function syncRecording(container, spec, step) {
      const video = container.querySelector('[data-role="recording-video"]');
      const empty = container.querySelector('[data-role="empty-recording"]');
      const controls = container.querySelector('[data-role="recording-controls"]');

      if (!video) {
        return;
      }

      ensureRecordingControls(container);

      if (!spec.recordingFile) {
        if (empty) empty.style.display = 'block';
        video.style.display = 'none';
        if (controls) controls.style.display = 'none';
        syncRecordingShell(container, video);
        updateRecordingCaption(container, spec);
        return;
      }

      if (empty) empty.style.display = 'none';
      video.style.display = 'block';
      if (controls) controls.style.display = 'block';

      if (step.videoOffsetMs === undefined || step.videoOffsetMs === null) {
        video.pause();
        updateRecordingControls(container, video);
        updateRecordingCaption(container, spec, step);
        return;
      }

      const seekSeconds = Math.max(0, step.videoOffsetMs / 1000);
      updateRecordingCaption(container, spec, step);

      const applySeek = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : undefined;
        const clampedSeconds =
          duration === undefined
            ? seekSeconds
            : Math.min(seekSeconds, Math.max(duration - 0.05, 0));
        video.pause();
        if (typeof video.fastSeek === 'function') {
          video.fastSeek(clampedSeconds);
        } else {
          video.currentTime = clampedSeconds;
        }
        syncRecordingShell(container, video);
        updateRecordingControls(container, video);
      };

      if (video.readyState >= 1) {
        applySeek();
        return;
      }

      const handleLoadedMetadata = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        applySeek();
      };
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      video.load();
    }

    function updateRecordingCaption(container, spec, step, currentSeconds) {
      const label = container.querySelector('[data-role="recording-caption"]');
      if (!label) {
        return;
      }
      if (!spec.recordingFile) {
        label.textContent = 'No session recording was captured for this spec.';
        return;
      }
      if (!step) {
        label.textContent = 'No recorded actions are available for this spec.';
        return;
      }
      if (step.videoOffsetMs === undefined || step.videoOffsetMs === null) {
        label.textContent = 'No synced recording timestamp is available for the selected step.';
        return;
      }
      if (typeof currentSeconds === 'number' && Number.isFinite(currentSeconds)) {
        label.textContent = 'Viewing ' + formatVideoClock(currentSeconds) + ' with the nearest recorded action selected.';
        return;
      }
      label.textContent = 'Paused at ' + formatVideoClock(step.videoOffsetMs / 1000) + ' for the selected step.';
    }

    updatePrimaryBackButton();

    for (const spec of reportPayload.specs) {
      if (spec.steps.length > 0) {
        selectStep(spec.specId, 0);
      }
    }
  </script>
</body>
</html>`;
}

function renderSingleSpecPage(
  manifest: ReportRunManifestRecord,
  item: ReportSpecListItem | undefined,
): string {
  if (!item) {
    return `
      <section class="overview-panel">
        <div class="overview-panel-body">
          <div class="empty-panel">No spec details were recorded for this run.</div>
        </div>
      </section>
    `;
  }

  return renderSpecDetailSection(item, true, undefined, manifest);
}

function renderSuiteRunPage(
  manifest: ReportRunManifestRecord,
  items: ReportSpecListItem[],
  summary: OutcomeSummary,
): string {
  const suiteLabel = deriveReportTitle(manifest);
  return `
    <section id="suite-overview" class="overview-grid">
      <section class="overview-panel">
        <div class="overview-panel-body">
          <h2 class="overview-title">Run summary</h2>
          <p class="overview-subtitle">Completed suite-level view based on the locally captured report artifacts.</p>
          <div class="segment-summary">
            <div class="segment-shell">
              ${renderSummarySegments(summary)}
            </div>
            <div class="metric-cards">
              <div class="metric-card">
                <div class="metric-value">${summary.success}/${summary.total}</div>
                <div class="metric-label">Tests passed</div>
              </div>
              <div class="metric-card">
                <div class="metric-value">${formatLongDuration(manifest.run.durationMs)}</div>
                <div class="metric-label">Run duration</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      ${renderRunContextPanel(manifest)}
      <section class="suite-list-shell">
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
            ${items.map((item) => renderSuiteRow(item, manifest.run.app.label)).join('')}
          </tbody>
        </table>
      </section>
    </section>
    ${items.map((item) => renderSpecDetailSection(item, false, suiteLabel, manifest)).join('')}
  `;
}

function renderRunContextPanel(manifest: ReportRunManifestRecord): string {
  return `
    <section class="overview-panel">
      <div class="overview-panel-body">
        ${renderRunContextContent(manifest, 'overview-title', 'overview-subtitle')}
      </div>
    </section>
  `;
}

function renderRunContextContent(
  manifest: ReportRunManifestRecord,
  titleClass: string,
  subtitleClass: string,
): string {
  return `
    <h2 class="${titleClass}">Run Context</h2>
    <p class="${subtitleClass}">Inputs and environment captured for this report.</p>
    <div class="run-context-summary">
      ${renderRunContextSummary(manifest)}
    </div>
  `;
}

function renderRunContextSummary(manifest: ReportRunManifestRecord): string {
  return [
    renderContextSummaryItem('Environment', manifest.input.environment.envName),
    renderContextSummaryItem('Platform', manifest.run.platform),
    renderContextSummaryItem('Model', manifest.run.model.label),
    renderContextSummaryItem('App', manifest.run.app.label),
  ].join('');
}

function renderContextSummaryItem(label: string, value: string): string {
  return `
    <div class="context-summary-item">
      <span class="context-summary-label">${escapeHtml(label)}</span>
      <div class="context-summary-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function renderSummarySegments(summary: OutcomeSummary): string {
  const segments = [
    { label: 'Success', className: 'success', count: summary.success },
    { label: 'Failure', className: 'failure', count: summary.failure },
    { label: 'Error', className: 'error', count: summary.error },
    { label: 'Not Executed', className: 'not-executed', count: summary.notExecuted },
  ];

  return `
    <div class="segment-bar">
      ${segments
        .filter((segment) => segment.count > 0)
        .map((segment) => {
          const width = summary.total === 0 ? 0 : (segment.count / summary.total) * 100;
          return `<div class="segment ${segment.className}" style="width:${width.toFixed(2)}%"></div>`;
        })
        .join('')}
    </div>
    <div class="segment-legend">
      ${segments.map((segment) => {
        const percent = summary.total === 0 ? 0 : Math.round((segment.count / summary.total) * 100);
        return `
          <span class="segment-legend-item">
            <span class="segment-legend-dot ${segment.className}" style="background:${segment.className === 'success'
              ? 'var(--success)'
              : segment.className === 'failure'
                ? 'var(--failure)'
                : segment.className === 'error'
                  ? 'var(--warning)'
                  : 'var(--icon)'}"></span>
            <span>${segment.label} - ${percent}%</span>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

function renderRunIndexRow(run: ReportIndexRunRecord): string {
  const resultLabel = run.passedCount + run.failedCount === 0
    ? 'NA'
    : `${run.passedCount} / ${run.selectedSpecCount}`;
  const href = buildRunRoute(run.runId);

  return `
    <tr class="history-row" onclick="window.location.href='${escapeJs(href)}'">
      <td>
        <div class="run-name-cell">
          ${renderTintedPngIcon(run.displayKind === 'suite' ? TEST_SUITE_ICON_SRC : TEST_ICON_SRC)}
          <div class="run-name-copy">
            <a class="run-name-link" href="${escapeHtml(href)}">${escapeHtml(run.displayName)}</a>
            <div class="run-secondary">${escapeHtml(run.runId)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(run.appLabel)}</td>
      <td>${run.durationMs > 0 ? escapeHtml(formatLongDuration(run.durationMs)) : 'NA'}</td>
      <td>${renderStatusPill(run.success ? 'success' : 'failure')}</td>
      <td>${escapeHtml(resultLabel)}</td>
      <td>
        <span class="run-on-badge">
          <img class="png-icon" src="${LOCAL_ICON_SRC}" alt="" />
          <span>Local</span>
        </span>
      </td>
      <td>${escapeHtml(run.triggeredFrom)}</td>
    </tr>
  `;
}

function renderSuiteRow(item: ReportSpecListItem, appLabel: string): string {
  return `
    <tr class="suite-row" onclick="selectSpec('${escapeJs(item.input.specId)}')">
      <td>
        <div class="run-name-cell">
          ${renderTintedPngIcon(TEST_ICON_SRC)}
          <div class="run-name-copy">
            <span class="run-name-link">${escapeHtml(item.input.specName)}</span>
            <div class="run-secondary">${escapeHtml(item.input.relativePath)}</div>
          </div>
        </div>
      </td>
      <td>${escapeHtml(appLabel)}</td>
      <td>${escapeHtml(item.durationLabel)}</td>
      <td>${renderStatusPill(item.status)}</td>
    </tr>
  `;
}

function renderSpecDetailSection(
  item: ReportSpecListItem,
  visible: boolean,
  parentLabel?: string,
  manifest?: ReportRunManifestRecord,
): string {
  const detailClass = visible ? 'detail-shell is-visible' : 'detail-shell';
  const detailSubtitle = parentLabel
    ? `${parentLabel} · ${item.input.relativePath}`
    : item.input.relativePath;
  const spec = item.executed;
  const initialStep = spec?.steps[0];
  const statusText = item.status === 'error'
    ? 'Error'
    : item.status === 'failure'
      ? 'Failed'
      : item.status === 'not_executed'
        ? 'Not executed'
        : 'Passed';
  const analysisText = spec
    ? spec.analysis || spec.message || 'No overall analysis recorded.'
    : 'This spec was selected for the run, but it never started. The batch ended before this spec could execute.';
  const snapshotYamlText = spec?.snapshotYamlText ?? item.input.snapshotYamlText;
  const snapshotYamlPath = spec?.snapshotYamlPath ?? item.input.snapshotYamlPath;
  const stepCount = spec?.steps.length ?? 0;
  const recordingSpeedId = `recording-speed-${item.input.specId}`;

  return `
    <section class="${detailClass}" data-spec-panel="${escapeHtml(item.input.specId)}">
      <div class="detail-header">
        <div class="detail-header-main">
          <div class="detail-header-copy">
            <h2>${escapeHtml(item.input.specName)}</h2>
            <p>${escapeHtml(detailSubtitle)}</p>
          </div>
        </div>
        ${renderStatusPill(item.status)}
      </div>

      <div class="detail-meta">
        <div class="detail-meta-card"><strong>Status</strong><span>${escapeHtml(statusText)}</span></div>
        <div class="detail-meta-card"><strong>Duration</strong><span>${escapeHtml(spec ? formatLongDuration(spec.durationMs) : 'NA')}</span></div>
        <div class="detail-meta-card"><strong>Steps</strong><span>${stepCount} recorded</span></div>
        <div class="detail-meta-card"><strong>Path</strong><span>${escapeHtml(item.input.relativePath)}</span></div>
      </div>

      ${renderSpecTestSection(snapshotYamlPath, snapshotYamlText)}
      ${manifest ? renderRunContextSection(manifest) : ''}
      ${renderSpecAnalysisSection(item.status, analysisText)}

      <div class="workspace">
        <div class="timeline-panel">
          <p class="section-label">Agent Actions</p>
          <div class="timeline-scroll">
            ${spec && spec.steps.length > 0
              ? spec.steps.map((step, index) => renderStepButton(spec.specId, step, index)).join('')
              : '<div class="empty-panel">No steps were recorded for this spec.</div>'}
          </div>
        </div>

        <div class="detail-panel" data-step-detail="${escapeHtml(item.input.specId)}">
          <p class="section-label">Session Recording</p>
          <div class="media-shell recording-shell">
            ${spec?.recordingFile
              ? `<video data-role="recording-video" playsinline preload="metadata" src="${escapeHtml(spec.recordingFile)}"></video>`
              : '<div class="empty-shot" data-role="empty-recording">No session recording was captured for this spec.</div>'}
            ${spec?.recordingFile
              ? '<div class="empty-shot" data-role="empty-recording" style="display:none">No session recording was captured for this spec.</div>'
              : ''}
          </div>
          <div class="recording-controls" data-role="recording-controls" style="display:${spec?.recordingFile ? 'block' : 'none'}">
            <div class="recording-control-row">
              <button
                class="recording-icon-button primary"
                data-role="recording-playpause"
                type="button"
                aria-label="Play recording"
                title="Play recording"
              >${renderPlayIconSvg()}</button>
              <span class="recording-time" data-role="recording-current">${formatVideoTimestamp(initialStep?.videoOffsetMs)}</span>
              <input
                class="recording-timeline"
                data-role="recording-seekbar"
                type="range"
                min="0"
                max="0"
                step="0.1"
                value="${initialStep?.videoOffsetMs !== undefined ? String(Math.max(0, initialStep.videoOffsetMs / 1000)) : '0'}"
                aria-label="Seek recording timeline"
              />
              <span class="recording-time" data-role="recording-duration">--:--</span>
              <label class="visually-hidden" for="${escapeHtml(recordingSpeedId)}">Playback speed</label>
              <select
                class="recording-speed"
                data-role="recording-speed"
                id="${escapeHtml(recordingSpeedId)}"
                aria-label="Playback speed"
              >
                <option value="1">1x</option>
                <option value="2" selected>2x</option>
                <option value="4">4x</option>
                <option value="8">8x</option>
              </select>
              <button
                class="recording-icon-button"
                data-role="recording-fullscreen"
                type="button"
                aria-label="Open recording fullscreen"
                title="Open recording fullscreen"
              >${renderFullscreenIconSvg()}</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderSpecTestSection(
  snapshotYamlPath: string | undefined,
  snapshotYamlText: string | undefined,
): string {
  const content = snapshotYamlText
    ? `<div class="yaml-shell"><pre class="yaml-block"><code>${escapeHtml(snapshotYamlText)}</code></pre></div>`
    : '<div class="empty-panel">Snapshot YAML was not available for this report.</div>';
  const action = snapshotYamlPath
    ? `<a class="detail-section-link" href="${escapeHtml(snapshotYamlPath)}">Open raw YAML</a>`
    : '';
  return renderDetailSectionCard({
    title: 'Test',
    subtitle: 'Captured YAML snapshot for this spec.',
    action,
    content,
  });
}

function renderRunContextSection(manifest: ReportRunManifestRecord): string {
  return renderDetailSectionCard({
    title: 'Run Context',
    subtitle: 'Inputs and environment captured for this report.',
    content: `<div class="run-context-summary">${renderRunContextSummary(manifest)}</div>`,
  });
}

function renderSpecAnalysisSection(status: SpecOutcomeStatus, analysisText: string): string {
  return renderDetailSectionCard({
    title: 'Analysis',
    subtitle: 'Overall result commentary captured for this spec.',
    action: renderStatusPill(status),
    cardClass: `analysis-card ${status}`,
    content: `<div class="analysis-copy">${escapeHtml(analysisText)}</div>`,
  });
}

function renderDetailSectionCard(params: {
  title: string;
  subtitle: string;
  content: string;
  action?: string;
  cardClass?: string;
}): string {
  return `
    <div class="detail-section-shell">
      <div class="detail-section-card ${params.cardClass ?? ''}">
        <div class="detail-section-header">
          <div class="detail-section-copy">
            <h3 class="detail-section-title">${escapeHtml(params.title)}</h3>
            <p class="detail-section-subtitle">${escapeHtml(params.subtitle)}</p>
          </div>
          ${params.action ?? ''}
        </div>
        ${params.content}
      </div>
    </div>
  `;
}

function renderStepButton(specId: string, step: RunManifestStepRecord, index: number): string {
  const statusClass = step.success ? 'success' : step.actionType === 'run_failure' ? 'error' : 'failure';
  const reasoningText = resolveStepReasoning(step);
  return `
    <button
      class="step-button ${index === 0 ? 'is-selected' : ''}"
      data-spec-id="${escapeHtml(specId)}"
      data-step-index="${index}"
      onclick="selectStep('${escapeJs(specId)}', ${index})"
      type="button"
    >
      <div class="step-row">
        <span class="step-icon ${statusClass}">${statusClass === 'success' ? '✓' : '!'}</span>
        <div class="step-copy">
          <div class="step-title">${escapeHtml(step.naturalLanguageAction || step.actionType)}</div>
        </div>
        <div class="duration-chip">${escapeHtml(formatStepDuration(step.durationMs || step.trace?.totalMs || 0))}</div>
      </div>
      ${reasoningText
        ? `<div class="step-expanded"><div class="step-reasoning-copy">${escapeHtml(reasoningText)}</div></div>`
        : ''}
    </button>
  `;
}

function resolveStepReasoning(step: RunManifestStepRecord): string | undefined {
  const title = normalizeStepText(step.naturalLanguageAction || step.actionType);
  for (const candidate of [step.thought?.think, step.thought?.plan, step.reason]) {
    const normalized = normalizeStepText(candidate);
    if (!normalized || normalized === title) {
      continue;
    }
    return normalized;
  }
  return undefined;
}

function normalizeStepText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function toReportViewModel(manifest: ReportRunManifestRecord): ReportRunManifestRecord {
  const runId = manifest.run.runId;
  return {
    ...manifest,
    input: {
      ...manifest.input,
      suite: manifest.input.suite
        ? {
            ...manifest.input.suite,
            snapshotYamlPath: buildRunScopedArtifactPath(runId, manifest.input.suite.snapshotYamlPath),
            snapshotJsonPath: buildRunScopedArtifactPath(runId, manifest.input.suite.snapshotJsonPath),
          }
        : undefined,
      specs: manifest.input.specs.map((spec) => toSelectedSpecViewModel(runId, spec)),
    },
    specs: manifest.specs.map((spec) => toSpecViewModel(runId, spec)),
    paths: {
      ...manifest.paths,
      runJson: buildRunScopedArtifactPath(runId, manifest.paths.runJson),
      summaryJson: buildRunScopedArtifactPath(runId, manifest.paths.summaryJson),
      log: buildRunScopedArtifactPath(runId, manifest.paths.log),
      runContextJson: manifest.paths.runContextJson
        ? buildRunScopedArtifactPath(runId, manifest.paths.runContextJson)
        : undefined,
    },
  };
}

function toSelectedSpecViewModel(
  runId: string,
  spec: ReportManifestSelectedSpecRecord,
): ReportManifestSelectedSpecRecord {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
  };
}

function toSpecViewModel(runId: string, spec: ReportManifestSpecRecord): ReportManifestSpecRecord {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
    previewScreenshotPath: spec.previewScreenshotPath
      ? buildRunScopedArtifactPath(runId, spec.previewScreenshotPath)
      : undefined,
    resultJsonPath: buildRunScopedArtifactPath(runId, spec.resultJsonPath),
    recordingFile: spec.recordingFile
      ? buildRunScopedArtifactPath(runId, spec.recordingFile)
      : undefined,
    steps: spec.steps.map((step) => ({
      ...step,
      screenshotFile: step.screenshotFile
        ? buildRunScopedArtifactPath(runId, step.screenshotFile)
        : undefined,
      stepJsonFile: step.stepJsonFile
        ? buildRunScopedArtifactPath(runId, step.stepJsonFile)
        : undefined,
    })),
    firstFailure: spec.firstFailure
      ? {
          ...spec.firstFailure,
          screenshotPath: spec.firstFailure.screenshotPath
            ? buildRunScopedArtifactPath(runId, spec.firstFailure.screenshotPath)
            : undefined,
          stepJsonPath: spec.firstFailure.stepJsonPath
            ? buildRunScopedArtifactPath(runId, spec.firstFailure.stepJsonPath)
            : undefined,
        }
      : undefined,
  };
}

function buildRunScopedArtifactPath(runId: string, relativePath: string): string {
  return buildArtifactRoute(`${runId}/${relativePath}`);
}

function buildSpecListItems(manifest: ReportRunManifestRecord): ReportSpecListItem[] {
  const executedById = new Map(manifest.specs.map((spec) => [spec.specId, spec]));
  const selectedSpecs = manifest.input.specs;
  if (selectedSpecs.length === 0) {
    return manifest.specs.map((spec) => ({
      input: {
        specId: spec.specId,
        specName: spec.specName,
        relativePath: spec.relativePath,
        workspaceSourcePath: spec.workspaceSourcePath,
        snapshotYamlPath: spec.snapshotYamlPath,
        snapshotJsonPath: spec.snapshotJsonPath,
        snapshotYamlText: spec.snapshotYamlText,
        bindingReferences: spec.bindingReferences,
      },
      executed: spec,
      status: classifySpecStatus(spec),
      durationLabel: formatLongDuration(spec.durationMs),
    }));
  }

  return selectedSpecs.map((selected) => {
    const executed = executedById.get(selected.specId);
    return {
      input: selected,
      executed,
      status: executed ? classifySpecStatus(executed) : 'not_executed',
      durationLabel: executed ? formatLongDuration(executed.durationMs) : 'NA',
    };
  });
}

function summarizeSpecItems(items: ReportSpecListItem[]): OutcomeSummary {
  return items.reduce<OutcomeSummary>(
    (summary, item) => {
      summary.total += 1;
      if (item.status === 'success') {
        summary.success += 1;
      } else if (item.status === 'failure') {
        summary.failure += 1;
      } else if (item.status === 'error') {
        summary.error += 1;
      } else {
        summary.notExecuted += 1;
      }
      return summary;
    },
    {
      total: 0,
      success: 0,
      failure: 0,
      error: 0,
      notExecuted: 0,
    },
  );
}

function classifySpecStatus(spec: ReportManifestSpecRecord): SpecOutcomeStatus {
  if (spec.success) {
    return 'success';
  }
  if (spec.steps[0]?.actionType === 'run_failure') {
    return 'error';
  }
  return 'failure';
}

function deriveReportTitle(manifest: ReportRunManifestRecord): string {
  const target = resolveRunTarget(manifest);
  if (target.type === 'suite' && target.suiteName) {
    return target.suiteName;
  }

  if (manifest.input.specs.length === 1) {
    return manifest.input.specs[0]?.specName || manifest.run.runId;
  }

  if (manifest.input.specs.length > 1) {
    const first = manifest.input.specs[0];
    return `${first?.specName || 'Selected specs'} +${manifest.input.specs.length - 1} more`;
  }

  return manifest.run.runId;
}

function renderStatusPill(status: SpecOutcomeStatus | 'success' | 'failure'): string {
  const label = status === 'success'
    ? 'Passed'
    : status === 'failure'
      ? 'Failed'
      : status === 'error'
        ? 'Error'
        : 'Not Executed';
  return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderSummaryCard(label: string, value: string, tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral', iconSvg: string): string {
  const iconStyle = tone === 'accent'
    ? 'color: var(--accent); background: rgba(67, 24, 255, 0.1);'
    : tone === 'success'
      ? 'color: var(--success); background: rgba(5, 205, 153, 0.12);'
      : tone === 'warning'
        ? 'color: var(--warning); background: rgba(255, 146, 12, 0.12);'
        : tone === 'danger'
          ? 'color: var(--failure); background: rgba(238, 93, 80, 0.12);'
          : 'color: var(--text); background: var(--panel-alt);';
  return `
    <div class="summary-card">
      <span class="summary-card-icon" style="${iconStyle}">${iconSvg}</span>
      <span>
        <div class="summary-card-label">${escapeHtml(label)}</div>
        <div class="summary-card-value">${escapeHtml(value)}</div>
      </span>
    </div>
  `;
}

function resolveRunTarget(manifest: ReportRunManifestRecord): RunTargetRecord {
  return manifest.run.target ?? { type: 'direct' };
}

function stripSnapshotYamlText(manifest: ReportRunManifestRecord): SharedRunManifestRecord {
  return {
    ...manifest,
    input: {
      ...manifest.input,
      specs: manifest.input.specs.map(({ snapshotYamlText: _snapshotYamlText, ...spec }) => spec),
    },
    specs: manifest.specs.map(({ snapshotYamlText: _snapshotYamlText, ...spec }) => spec),
  };
}

function formatLongDuration(durationMs: number | undefined): string {
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

function formatStepDuration(durationMs: number | undefined): string {
  const seconds = Number(durationMs || 0) / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

function formatRelativeTime(timestamp: string): string {
  const deltaMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const totalMinutes = Math.floor(deltaMs / 60000);
  if (totalMinutes < 1) {
    return 'just now';
  }
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours}h`;
  }
  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 7) {
    return `${totalDays}d`;
  }
  const totalWeeks = Math.floor(totalDays / 7);
  return `${totalWeeks}w`;
}

function formatVideoTimestamp(videoOffsetMs: number | undefined): string {
  if (videoOffsetMs === undefined) {
    return '00:00';
  }
  const wholeSeconds = Math.floor(Math.max(0, videoOffsetMs / 1000));
  const minutesPart = Math.floor(wholeSeconds / 60);
  const secondsPart = wholeSeconds % 60;
  return `${String(minutesPart).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function successRateTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate >= 80) {
    return 'success';
  }
  if (rate >= 50) {
    return 'warning';
  }
  return 'danger';
}

function renderFontLinks(): string {
  return `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  `;
}

function renderSharedCss(): string {
  return `
    :root {
      --bg: #F4F7FE;
      --panel: #FFFFFF;
      --panel-alt: #F4F7FE;
      --text: #2B3674;
      --muted: #707EAE;
      --icon: #8E9AB9;
      --accent: #4318FF;
      --accent-soft: rgba(67, 24, 255, 0.1);
      --success: #05CD99;
      --warning: #FF920C;
      --failure: #EE5D50;
      --border: #E0E5F2;
      --border-light: #E9EDF7;
      --selected: #F0F2F7;
      --shadow: 0 18px 40px rgba(112, 126, 174, 0.12);
      --radius: 20px;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "DM Sans", "Helvetica Neue", Arial, sans-serif;
    }

    body {
      background:
        radial-gradient(circle at top right, rgba(67, 24, 255, 0.08), transparent 32%),
        linear-gradient(180deg, #fbfcff 0%, var(--bg) 100%);
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .page {
      max-width: 1360px;
      margin: 0 auto;
      padding: 28px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    .status-pill.success {
      background: rgba(5, 205, 153, 0.14);
      color: var(--success);
    }

    .status-pill.failure {
      background: rgba(238, 93, 80, 0.14);
      color: var(--failure);
    }

    .status-pill.error {
      background: rgba(255, 146, 12, 0.14);
      color: var(--warning);
    }

    .status-pill.not_executed {
      background: rgba(112, 126, 174, 0.14);
      color: var(--muted);
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 900px) {
      .page {
        padding: 20px;
      }
    }
  `;
}

function renderPlayCircleIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M10.4 8.8l5.2 3.2-5.2 3.2z" fill="currentColor" stroke="none"></path></svg>';
}

function renderCheckCircleIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M8.8 12.2l2.1 2.1 4.3-4.6"></path></svg>';
}

function renderTimerIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"></circle><path d="M12 13V9.5"></path><path d="M15 5h-6"></path></svg>';
}

function renderBackArrowIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5"></path></svg>';
}

function renderPlayIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5-9-5.5z"></path></svg>';
}

function renderPauseIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6.5h3.5v11H7zm6.5 0H17v11h-3.5z"></path></svg>';
}

function renderFullscreenIconSvg(): string {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V6h3V4H4v5zm9-5v2h3v3h2V4zm3 11v3h-3v2h5v-5zM6 15H4v5h5v-2H6z"></path></svg>';
}

function renderTintedPngIcon(src: string): string {
  return `<span class="tinted-png-icon" style="--icon-mask:url('${escapeHtml(src)}');" aria-hidden="true"></span>`;
}

export function renderRunNotFoundHtml(runId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Run Not Found</title>
  ${renderFontLinks()}
  <style>
    ${renderSharedCss()}

    .not-found-shell {
      max-width: 720px;
      margin: 80px auto;
      padding: 0 24px;
    }

    .not-found-card {
      padding: 28px 32px;
      background: white;
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: var(--shadow);
    }

    .not-found-card h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }

    .not-found-card p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main class="not-found-shell">
    <section class="not-found-card">
      <h1>Run Not Found</h1>
      <p>No run manifest was found for <code>${escapeHtml(runId)}</code>.</p>
      <p style="margin-top:16px;"><a href="/">Back to reports</a></p>
    </section>
  </main>
</body>
</html>`;
}
