import type { RunIndexEntry } from '@finalrun/common';

type RunOutcomeStatus = 'success' | 'failure' | 'aborted';

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

export interface ReportIndexRunRecord extends RunIndexEntry {
  displayName: string;
  displayKind: 'suite' | 'single_test' | 'multi_test' | 'fallback';
  triggeredFrom: 'Suite' | 'Direct';
  selectedTestCount: number;
}

export interface ReportIndexViewModel {
  generatedAt: string;
  summary: {
    totalRuns: number;
    totalSuccessRate: number;
    totalDurationMs: number;
  };
  runs: ReportIndexRunRecord[];
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

function renderRunIndexRow(run: ReportIndexRunRecord): string {
  const resultLabel = run.passedCount + run.failedCount === 0
    ? 'NA'
    : `${run.passedCount} / ${run.selectedTestCount}`;
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
      <td>${renderStatusPill(resolveRunStatus(run))}</td>
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

function buildRunRoute(runId: string): string {
  return `/runs/${encodeURIComponent(runId)}`;
}

function renderTintedPngIcon(src: string): string {
  return `<span class="tinted-png-icon" style="--icon-mask:url('${escapeHtml(src)}');" aria-hidden="true"></span>`;
}

function resolveRunStatus(
  run: Pick<RunIndexEntry, 'status' | 'success'>,
): RunOutcomeStatus {
  return run.status === 'aborted' ? 'aborted' : run.success ? 'success' : 'failure';
}

function renderStatusPill(status: RunOutcomeStatus): string {
  const label = status === 'success' ? 'Passed' : status === 'aborted' ? 'Aborted' : 'Failed';
  return `<span class="status-pill ${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function renderSummaryCard(
  label: string,
  value: string,
  tone: 'accent' | 'success' | 'warning' | 'danger' | 'neutral',
  iconSvg: string,
): string {
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
      --success: #05CD99;
      --aborted: #475569;
      --warning: #FF920C;
      --failure: #EE5D50;
      --border: #E0E5F2;
      --border-light: #E9EDF7;
      --selected: #F0F2F7;
      --shadow: 0 18px 40px rgba(112, 126, 174, 0.12);
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
      white-space: nowrap;
    }

    .status-pill.success {
      background: rgba(5, 205, 153, 0.14);
      color: var(--success);
    }

    .status-pill.aborted {
      background: rgba(71, 85, 105, 0.14);
      color: var(--aborted);
    }

    .status-pill.failure {
      background: rgba(238, 93, 80, 0.14);
      color: var(--failure);
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
