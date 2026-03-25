import type {
  RunIndexRecord,
  RunManifestRecord,
  RunManifestSelectedSpecRecord,
  RunManifestSpecRecord,
  RunManifestStepRecord,
  RunTargetRecord,
} from '@finalrun/common';
import { buildArtifactRoute, buildRunRoute } from './artifacts';

export function renderRunIndexHtml(index: RunIndexRecord): string {
  const dataJson = JSON.stringify(index).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinalRun Reports</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --panel: #ffffff;
      --panel-alt: #eef3fb;
      --border: #d7dfeb;
      --text: #1a2740;
      --muted: #61728b;
      --accent: #2563eb;
      --success: #1f8f5f;
      --danger: #c24141;
      --success-soft: #e8f7ef;
      --danger-soft: #fdeaea;
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .page {
      max-width: 1400px;
      margin: 0 auto;
      padding: 24px;
    }

    .header,
    .filters,
    .runs {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .header,
    .filters {
      padding: 20px 24px;
      margin-bottom: 18px;
    }

    .header h1 {
      margin: 0 0 8px;
      font-size: 30px;
    }

    .header p {
      margin: 0;
      color: var(--muted);
    }

    .stats {
      margin-top: 18px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
    }

    .stat {
      background: var(--panel-alt);
      border-radius: 14px;
      padding: 14px 16px;
    }

    .stat strong {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }

    .stat span {
      font-size: 18px;
      font-weight: 700;
    }

    .filters-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }

    .filters input,
    .filters select {
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      font: inherit;
      min-width: 180px;
      background: white;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      text-align: left;
      padding: 14px 18px;
      border-top: 1px solid var(--border);
      font-size: 14px;
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .status {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .status.success {
      background: var(--success-soft);
      color: var(--success);
    }

    .status.failure {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .muted {
      color: var(--muted);
    }

    .empty {
      padding: 28px 24px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="header">
      <h1>FinalRun Reports</h1>
      <p>Browse local test runs and open the detailed per-run report.</p>
      <div class="stats">
        <div class="stat"><strong>Runs</strong><span id="stat-runs">0</span></div>
        <div class="stat"><strong>Passed</strong><span id="stat-passed">0</span></div>
        <div class="stat"><strong>Failed</strong><span id="stat-failed">0</span></div>
        <div class="stat"><strong>Specs</strong><span id="stat-specs">0</span></div>
      </div>
    </section>

    <section class="filters">
      <div class="filters-row">
        <input id="search" type="search" placeholder="Search run id, env, platform, failure..." />
        <select id="status-filter">
          <option value="all">All statuses</option>
          <option value="failure">Failed only</option>
          <option value="success">Passed only</option>
        </select>
      </div>
    </section>

    <section class="runs">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Target</th>
            <th>Run</th>
            <th>Env</th>
            <th>Platform</th>
            <th>Specs</th>
            <th>Duration</th>
            <th>First Failure</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody id="runs-body"></tbody>
      </table>
      <div id="runs-empty" class="empty" style="display:none">No runs matched the current filter.</div>
    </section>
  </div>

  <script id="finalrun-runs-data" type="application/json">${dataJson}</script>
  <script>
    const payload = JSON.parse(document.getElementById('finalrun-runs-data').textContent);
    const searchInput = document.getElementById('search');
    const statusFilter = document.getElementById('status-filter');
    const tbody = document.getElementById('runs-body');
    const empty = document.getElementById('runs-empty');

    function formatDuration(durationMs) {
      const seconds = Number(durationMs || 0) / 1000;
      return seconds >= 10 ? seconds.toFixed(0) + 's' : seconds.toFixed(1) + 's';
    }

    function buildRunHref(run) {
      return '/runs/' + encodeURIComponent(run.runId);
    }

    function buildArtifactHref(relativePath) {
      return '/artifacts/' + String(relativePath || '')
        .replace(/^\\/+/, '')
        .split('/')
        .map(encodeURIComponent)
        .join('/');
    }

    function render() {
      const query = String(searchInput.value || '').trim().toLowerCase();
      const status = String(statusFilter.value || 'all');
      const filtered = payload.runs.filter((run) => {
        if (status !== 'all' && run.status !== status) {
          return false;
        }
        if (!query) {
          return true;
        }
        const haystack = [
          run.runId,
          run.target?.type,
          run.target?.suiteName,
          run.target?.suitePath,
          run.envName,
          run.platform,
          run.modelLabel,
          run.firstFailure?.message,
          run.firstFailure?.specName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      });

      tbody.innerHTML = filtered.map((run) => {
        const firstFailure = run.firstFailure?.message || 'No failure recorded.';
        return \`
          <tr>
            <td><span class="status \${run.status}">\${run.status}</span></td>
            <td><strong>\${escapeHtml(formatRunTarget(run.target))}</strong>\${
              run.target?.suiteName
                ? '<div class="muted">' + escapeHtml(run.target.suiteName) + '</div>'
                : ''
            }</td>
            <td><strong>\${escapeHtml(run.runId)}</strong><div class="muted">\${escapeHtml(run.modelLabel)}</div></td>
            <td>\${escapeHtml(run.envName)}</td>
            <td>\${escapeHtml(run.platform)}</td>
            <td>\${run.passedCount}/\${run.specCount} passed</td>
            <td>\${formatDuration(run.durationMs)}</td>
            <td>\${escapeHtml(firstFailure)}</td>
            <td><a href="\${buildRunHref(run)}">report</a> · <a href="\${buildArtifactHref(run.paths.log)}">log</a> · <a href="\${buildArtifactHref(run.paths.runJson)}">run.json</a></td>
          </tr>
        \`;
      }).join('');

      empty.style.display = filtered.length === 0 ? 'block' : 'none';
      document.getElementById('stat-runs').textContent = String(payload.runs.length);
      document.getElementById('stat-passed').textContent = String(payload.runs.filter((run) => run.success).length);
      document.getElementById('stat-failed').textContent = String(payload.runs.filter((run) => !run.success).length);
      document.getElementById('stat-specs').textContent = String(payload.runs.reduce((total, run) => total + Number(run.specCount || 0), 0));
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatRunTarget(target) {
      return target && target.type === 'suite' ? 'Suite' : 'Direct';
    }

    searchInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    render();
  </script>
</body>
</html>`;
}

export function renderRunHtml(manifest: RunManifestRecord): string {
  const dataJson = JSON.stringify(toReportViewModel(manifest)).replace(/</g, '\\u003c');
  const view = toReportViewModel(manifest);
  const run = view.run;
  const specs = view.specs;
  const target = resolveRunTarget(view);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinalRun Report</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --panel: #ffffff;
      --panel-alt: #eef3fb;
      --border: #d7dfeb;
      --text: #1a2740;
      --muted: #61728b;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --success: #1f8f5f;
      --success-soft: #e8f7ef;
      --danger: #c24141;
      --danger-soft: #fdeaea;
      --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
      color: var(--text);
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .page {
      max-width: 1600px;
      margin: 0 auto;
      padding: 24px;
    }

    .run-header,
    .spec-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
    }

    .run-header {
      padding: 24px;
      margin-bottom: 20px;
    }

    .run-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .run-title h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.1;
    }

    .run-title p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 15px;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .status-pill.success {
      background: var(--success-soft);
      color: var(--success);
    }

    .status-pill.failure {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
      margin-top: 20px;
    }

    .meta-card {
      background: var(--panel-alt);
      border-radius: 14px;
      padding: 14px 16px;
      min-height: 74px;
    }

    .meta-card strong {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .meta-card span {
      display: block;
      font-size: 15px;
      font-weight: 600;
    }

    .spec-index {
      margin-bottom: 20px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .spec-index h2 {
      margin: 0;
      padding: 18px 22px 8px;
      font-size: 18px;
    }

    .spec-index table {
      width: 100%;
      border-collapse: collapse;
    }

    .spec-index th,
    .spec-index td {
      text-align: left;
      padding: 14px 22px;
      border-top: 1px solid var(--border);
      font-size: 14px;
    }

    .spec-index th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .spec-card {
      margin-bottom: 22px;
      overflow: hidden;
    }

    .spec-head {
      padding: 22px 24px 14px;
      border-bottom: 1px solid var(--border);
    }

    .spec-head h2 {
      margin: 0 0 8px;
      font-size: 22px;
    }

    .spec-head .subtext {
      color: var(--muted);
      font-size: 14px;
      word-break: break-all;
    }

    .analysis-banner {
      margin: 18px 24px 0;
      border-radius: 16px;
      border: 1px solid var(--border);
      padding: 18px 20px;
      background: var(--panel-alt);
    }

    .analysis-banner.success {
      background: var(--success-soft);
      border-color: rgba(31, 143, 95, 0.28);
    }

    .analysis-banner.failure {
      background: var(--danger-soft);
      border-color: rgba(194, 65, 65, 0.24);
    }

    .analysis-banner .label {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 15px;
      font-weight: 700;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(340px, 44%) minmax(360px, 56%);
      min-height: 560px;
    }

    .timeline-panel {
      border-right: 1px solid var(--border);
      padding: 20px 18px 24px 24px;
      overflow: auto;
    }

    .timeline-panel h3,
    .detail-panel h3 {
      margin: 0 0 14px;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .step-button {
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 14px;
      padding: 12px 14px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }

    .step-button:hover {
      background: rgba(37, 99, 235, 0.05);
      border-color: rgba(37, 99, 235, 0.14);
      transform: translateX(2px);
    }

    .step-button.is-selected {
      background: rgba(37, 99, 235, 0.08);
      border-color: rgba(37, 99, 235, 0.32);
    }

    .step-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .step-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: white;
      flex: 0 0 auto;
    }

    .step-icon.success { background: var(--success); }
    .step-icon.failure { background: var(--danger); }
    .step-title { font-weight: 600; margin-bottom: 4px; }
    .step-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
    }

    .duration-chip {
      margin-left: auto;
      background: var(--panel-alt);
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      color: var(--muted);
      flex: 0 0 auto;
    }

    .detail-panel {
      padding: 24px;
      background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(238,243,251,0.82) 100%);
    }

    .media-shell {
      width: min(100%, 360px);
      margin: 0 auto 16px;
      border-radius: 18px;
      overflow: hidden;
      background: #0f172a;
      min-height: 0;
      display: grid;
      place-items: center;
      border: 1px solid rgba(148, 163, 184, 0.24);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    }

    .recording-shell {
      aspect-ratio: var(--recording-aspect-ratio, 9 / 19.5);
    }

    .screenshot-shell {
      aspect-ratio: 9 / 19.5;
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
      color: #cbd5e1;
      font-size: 14px;
      padding: 18px;
      text-align: center;
    }

    .recording-meta {
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 13px;
    }

    .recording-controls {
      width: min(100%, 360px);
      margin: -4px auto 18px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.9);
    }

    .recording-control-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }

    .recording-icon-button {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0;
      background: #ffffff;
      color: var(--text);
      cursor: pointer;
    }

    .recording-icon-button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    .recording-icon-button svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
    }

    .recording-icon-button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .recording-timeline {
      width: 100%;
      margin: 0;
      accent-color: var(--accent);
    }

    .recording-timeline:disabled {
      opacity: 0.45;
    }

    .recording-times {
      margin-top: 8px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      color: var(--muted);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .detail-card {
      background: rgba(255, 255, 255, 0.88);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
    }

    .detail-card h4 {
      margin: 0 0 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }

    .detail-card p,
    .detail-card ul {
      margin: 0;
      padding-left: 18px;
      line-height: 1.5;
    }

    .detail-card ul {
      list-style: disc;
    }

    .trace-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-left: 18px;
      margin: 0;
    }

    .raw-links {
      padding: 0 24px 24px;
    }

    .artifact-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      font-size: 14px;
    }

    .artifact-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 1fr;
      }

      .timeline-panel {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="run-header">
      <div class="run-title">
        <div>
          <h1>FinalRun Local Report</h1>
          <p>Run ID: ${escapeHtml(run.runId)}</p>
        </div>
        <div class="status-pill ${run.success ? 'success' : 'failure'}">
          ${run.success ? 'Passed' : 'Failed'}
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-card"><strong>Environment</strong><span>${escapeHtml(run.envName)}</span></div>
        <div class="meta-card"><strong>Platform</strong><span>${escapeHtml(run.platform)}</span></div>
        <div class="meta-card"><strong>Model</strong><span>${escapeHtml(run.model.label)}</span></div>
        <div class="meta-card"><strong>Run Target</strong><span>${escapeHtml(formatRunTarget(target))}</span></div>
        ${target.type === 'suite' && target.suiteName
          ? `<div class="meta-card"><strong>Suite</strong><span>${escapeHtml(target.suiteName)}</span></div>`
          : ''}
        ${target.type === 'suite' && target.suitePath
          ? `<div class="meta-card"><strong>Suite Path</strong><span>${escapeHtml(target.suitePath)}</span></div>`
          : ''}
        <div class="meta-card"><strong>Started</strong><span>${escapeHtml(run.startedAt)}</span></div>
        <div class="meta-card"><strong>Duration</strong><span>${formatDuration(run.durationMs)}</span></div>
        <div class="meta-card"><strong>Specs</strong><span>${run.counts.specs.passed}/${run.counts.specs.total} passed</span></div>
        <div class="meta-card"><strong>Steps</strong><span>${run.counts.steps.failed} failed of ${run.counts.steps.total}</span></div>
        <div class="meta-card"><strong>Artifacts</strong><span><a href="${escapeHtml(view.paths.runJson)}">run.json</a> · <a href="${escapeHtml(view.paths.summaryJson)}">summary.json</a> · <a href="${escapeHtml(view.paths.log)}">runner.log</a></span></div>
      </div>
    </section>

    <section class="spec-index">
      <h2>Run Context</h2>
      <table>
        <tbody>
          <tr>
            <th>Run Target</th>
            <td>${escapeHtml(formatRunTarget(target))}</td>
          </tr>
          ${target.type === 'suite'
            ? `
          <tr>
            <th>Suite</th>
            <td>${escapeHtml(target.suiteName ?? 'Unknown suite')}</td>
          </tr>
          <tr>
            <th>Suite Manifest</th>
            <td>${renderSuiteManifestLink(view)}</td>
          </tr>
          <tr>
            <th>Suite Tests</th>
            <td>${renderSuiteTests(view)}</td>
          </tr>
          `
            : `
          <tr>
            <th>Selectors</th>
            <td>${run.selectors.length > 0 ? run.selectors.map((selector) => escapeHtml(selector)).join(', ') : '<span class="muted">No selectors recorded.</span>'}</td>
          </tr>
          `}
          <tr>
            <th>Variables</th>
            <td>${renderVariables(view)}</td>
          </tr>
          <tr>
            <th>Secrets</th>
            <td>${renderSecretReferences(view)}</td>
          </tr>
          <tr>
            <th>Spec Snapshots</th>
            <td>${view.input.specs.length > 0 ? view.input.specs.map((spec) => `<a href="${escapeHtml(spec.snapshotYamlPath)}">${escapeHtml(spec.relativePath)}</a>`).join(' · ') : '<span class="muted">No spec snapshots recorded.</span>'}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="spec-index">
      <h2>Spec Index</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Spec</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Path</th>
          </tr>
        </thead>
        <tbody>
          ${specs.map((spec, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><a href="#spec-${escapeHtml(spec.specId)}">${escapeHtml(spec.specName)}</a></td>
              <td>${spec.success ? 'Passed' : 'Failed'}</td>
              <td>${formatDuration(spec.durationMs)}</td>
              <td>${escapeHtml(spec.relativePath)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    ${specs.map((spec) => renderSpecSection(spec)).join('')}
  </div>

  <script id="finalrun-report-data" type="application/json">${dataJson}</script>
  <script>
    const reportPayload = JSON.parse(document.getElementById('finalrun-report-data').textContent);
    const specMap = Object.fromEntries(reportPayload.specs.map((spec) => [spec.specId, spec]));

    function selectStep(specId, stepIndex) {
      const spec = specMap[specId];
      const step = spec.steps[stepIndex];
      const container = document.querySelector('[data-spec-detail="' + specId + '"]');
      if (!container || !step) {
        return;
      }

      for (const button of document.querySelectorAll('[data-spec-id="' + specId + '"][data-step-index]')) {
        button.classList.toggle('is-selected', Number(button.dataset.stepIndex) === stepIndex);
      }

      const img = container.querySelector('[data-role="screenshot"]');
      const empty = container.querySelector('[data-role="empty-shot"]');
      if (img) {
        if (step.screenshotFile) {
          img.src = step.screenshotFile;
          img.alt = step.naturalLanguageAction || step.actionType;
          img.style.display = 'block';
          if (empty) empty.style.display = 'none';
        } else {
          img.removeAttribute('src');
          img.style.display = 'none';
          if (empty) empty.style.display = 'block';
        }
      }

      syncRecording(container, spec, step);

      container.querySelector('[data-role="action-title"]').textContent = step.naturalLanguageAction || step.actionType;
      container.querySelector('[data-role="reason"]').textContent = step.reason || 'No reasoning recorded.';
      container.querySelector('[data-role="analysis"]').textContent = step.analysis || 'No step analysis recorded.';
      container.querySelector('[data-role="status"]').textContent = step.success ? 'Success' : 'Failure';
      container.querySelector('[data-role="duration"]').textContent = formatDuration(step.durationMs || step.trace?.totalMs || 0);
      container.querySelector('[data-role="timestamp"]').textContent = step.timestamp || 'Unknown';
      container.querySelector('[data-role="error"]').textContent = step.errorMessage || 'No error recorded.';

      const thoughtList = container.querySelector('[data-role="thought-list"]');
      thoughtList.innerHTML = '';
      const thoughtItems = [];
      if (step.thought?.plan) thoughtItems.push(['Plan', step.thought.plan]);
      if (step.thought?.think) thoughtItems.push(['Think', step.thought.think]);
      if (step.thought?.act) thoughtItems.push(['Act', step.thought.act]);
      if (thoughtItems.length === 0) {
        thoughtList.innerHTML = '<li class="muted">No expanded planner thought recorded.</li>';
      } else {
        for (const [label, value] of thoughtItems) {
          const li = document.createElement('li');
          li.textContent = label + ': ' + value;
          thoughtList.appendChild(li);
        }
      }

      const traceList = container.querySelector('[data-role="trace-list"]');
      traceList.innerHTML = '';
      const spans = step.trace?.spans || [];
      if (spans.length === 0) {
        traceList.innerHTML = '<li class="muted">No timing trace recorded.</li>';
      } else {
        for (const span of spans) {
          const li = document.createElement('li');
          const detail = span.detail ? ' - ' + span.detail : '';
          li.textContent = span.name + ': ' + formatDuration(span.durationMs) + ' (' + span.status + ')' + detail;
          traceList.appendChild(li);
        }
      }

      const rawLinks = container.querySelector('[data-role="raw-links"]');
      rawLinks.innerHTML = '';
      const links = [
        step.stepJsonFile ? ['step.json', step.stepJsonFile] : null,
        step.screenshotFile ? ['screenshot', step.screenshotFile] : null,
        spec.recordingFile ? ['recording', spec.recordingFile] : null,
      ].filter(Boolean);
      if (links.length === 0) {
        rawLinks.innerHTML = '<span class="muted">No step artifact links recorded.</span>';
      } else {
        for (const [label, href] of links) {
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.textContent = label;
          rawLinks.appendChild(anchor);
        }
      }
    }

    function formatDuration(durationMs) {
      const ms = Number(durationMs || 0);
      const seconds = ms / 1000;
      return seconds >= 10 ? seconds.toFixed(0) + 's' : seconds.toFixed(1) + 's';
    }

    function formatVideoClock(totalSeconds) {
      const seconds = Math.max(0, Number(totalSeconds || 0));
      const minutesPart = Math.floor(seconds / 60);
      const secondsPart = seconds - (minutesPart * 60);
      return String(minutesPart).padStart(2, '0') + ':' + secondsPart.toFixed(1).padStart(4, '0');
    }

    function syncRecordingShell(container, video) {
      const shell = container.querySelector('.recording-shell');
      if (!shell) {
        return;
      }

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        shell.style.setProperty(
          '--recording-aspect-ratio',
          String(video.videoWidth) + ' / ' + String(video.videoHeight),
        );
        return;
      }

      shell.style.removeProperty('--recording-aspect-ratio');
    }

    function ensureRecordingControls(container) {
      const video = container.querySelector('[data-role="recording-video"]');
      const seekbar = container.querySelector('[data-role="recording-seekbar"]');
      const playPause = container.querySelector('[data-role="recording-playpause"]');
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

      video.addEventListener('loadedmetadata', syncControls);
      video.addEventListener('durationchange', syncControls);
      video.addEventListener('timeupdate', syncControls);
      video.addEventListener('play', syncControls);
      video.addEventListener('pause', syncControls);
      video.addEventListener('ended', syncControls);
      video.addEventListener('emptied', syncControls);
      seekbar.addEventListener('input', applySeek);
      seekbar.addEventListener('change', applySeek);
      playPause.addEventListener('click', togglePlayback);
      fullscreen.addEventListener('click', toggleFullscreen);
      video.dataset.seekbarBound = '1';
    }

    function updateRecordingControls(container, video) {
      const seekbar = container.querySelector('[data-role="recording-seekbar"]');
      const current = container.querySelector('[data-role="recording-current"]');
      const duration = container.querySelector('[data-role="recording-duration"]');
      const playPause = container.querySelector('[data-role="recording-playpause"]');
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
      duration.textContent = totalSeconds > 0 ? formatVideoClock(totalSeconds) : '--:--.-';
      playPause.innerHTML = video.paused || video.ended
        ? '${escapeJs(renderPlayIconSvg())}'
        : '${escapeJs(renderPauseIconSvg())}';
      playPause.setAttribute(
        'aria-label',
        video.paused || video.ended ? 'Play recording' : 'Pause recording',
      );
      playPause.setAttribute(
        'title',
        video.paused || video.ended ? 'Play recording' : 'Pause recording',
      );
      fullscreen.innerHTML = '${escapeJs(renderFullscreenIconSvg())}';
      fullscreen.setAttribute('title', 'Open recording fullscreen');
      fullscreen.disabled = !(video.currentSrc || video.src);
    }

    function syncRecording(container, spec, step) {
      const video = container.querySelector('[data-role="recording-video"]');
      const empty = container.querySelector('[data-role="empty-recording"]');
      const label = container.querySelector('[data-role="recording-caption"]');
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
        if (label) label.textContent = 'No session recording was captured for this spec.';
        return;
      }

      if (empty) empty.style.display = 'none';
      video.style.display = 'block';
      if (controls) controls.style.display = 'block';

      if (step.videoOffsetMs === undefined || step.videoOffsetMs === null) {
        video.pause();
        updateRecordingControls(container, video);
        if (label) label.textContent = 'No synced recording timestamp is available for the selected step.';
        return;
      }

      const seekSeconds = Math.max(0, step.videoOffsetMs / 1000);
      if (label) {
        label.textContent = 'Paused at ' + formatVideoClock(seekSeconds) + ' for the selected step.';
      }

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

    for (const spec of reportPayload.specs) {
      if (spec.steps.length > 0) {
        selectStep(spec.specId, 0);
      }
    }
  </script>
</body>
</html>`;
}

function toReportViewModel(manifest: RunManifestRecord): RunManifestRecord {
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
  spec: RunManifestSelectedSpecRecord,
): RunManifestSelectedSpecRecord {
  return {
    ...spec,
    snapshotYamlPath: buildRunScopedArtifactPath(runId, spec.snapshotYamlPath),
    snapshotJsonPath: buildRunScopedArtifactPath(runId, spec.snapshotJsonPath),
  };
}

function toSpecViewModel(runId: string, spec: RunManifestSpecRecord): RunManifestSpecRecord {
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

function renderSpecSection(spec: RunManifestSpecRecord): string {
  const analysisText = escapeHtml(spec.analysis || spec.message || 'No overall analysis recorded.');
  const initialStep = spec.steps[0];

  return `
    <section class="spec-card" id="spec-${escapeHtml(spec.specId)}">
      <div class="spec-head">
        <h2>${escapeHtml(spec.specName)}</h2>
        <div class="subtext">${escapeHtml(spec.relativePath)}</div>
      </div>
      <div class="analysis-banner ${spec.success ? 'success' : 'failure'}">
        <div class="label">Analysis · ${spec.success ? 'Success' : 'Failure'}</div>
        <p>${analysisText}</p>
      </div>
      <div class="workspace">
        <div class="timeline-panel">
          <h3>Agent Actions</h3>
          ${spec.steps.length > 0
            ? spec.steps.map((step, index) => renderStepButton(spec.specId, step, index)).join('')
            : '<p class="muted">No steps were recorded for this spec.</p>'}
        </div>
        <div class="detail-panel" data-spec-detail="${escapeHtml(spec.specId)}">
          <h3>Session Recording</h3>
          <div class="media-shell recording-shell">
            ${spec.recordingFile
              ? `<video data-role="recording-video" playsinline preload="metadata" src="${escapeHtml(spec.recordingFile)}"></video>`
              : '<div class="empty-shot" data-role="empty-recording">No session recording was captured for this spec.</div>'}
            ${spec.recordingFile
              ? '<div class="empty-shot" data-role="empty-recording" style="display:none">No session recording was captured for this spec.</div>'
              : ''}
          </div>
          <div class="recording-controls" data-role="recording-controls" style="display:${spec.recordingFile ? 'block' : 'none'}">
            <div class="recording-control-row">
              <button
                class="recording-icon-button primary"
                data-role="recording-playpause"
                type="button"
                aria-label="Play recording"
                title="Play recording"
              >${renderPlayIconSvg()}</button>
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
              <button
                class="recording-icon-button"
                data-role="recording-fullscreen"
                type="button"
                aria-label="Open recording fullscreen"
                title="Open recording fullscreen"
              >${renderFullscreenIconSvg()}</button>
            </div>
            <div class="recording-times">
              <span data-role="recording-current">${formatVideoTimestamp(initialStep?.videoOffsetMs)}</span>
              <span data-role="recording-duration">--:--.-</span>
            </div>
          </div>
          <div class="recording-meta" data-role="recording-caption">
            ${spec.recordingFile
              ? `Paused at ${formatVideoTimestamp(initialStep?.videoOffsetMs)} for the selected step.`
              : 'No session recording was captured for this spec.'}
          </div>
          <h3>Selected Step</h3>
          <div class="media-shell screenshot-shell">
            <img data-role="screenshot" alt="" style="display:${initialStep?.screenshotFile ? 'block' : 'none'}" />
            <div class="empty-shot" data-role="empty-shot" style="display:${initialStep?.screenshotFile ? 'none' : 'block'}">
              No screenshot recorded for the selected step.
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-card">
              <h4>Action</h4>
              <p data-role="action-title">${escapeHtml(initialStep?.naturalLanguageAction || 'No step selected')}</p>
            </div>
            <div class="detail-card">
              <h4>Reasoning</h4>
              <p data-role="reason">${escapeHtml(initialStep?.reason || 'No reasoning recorded.')}</p>
            </div>
            <div class="detail-card">
              <h4>Planner Thought</h4>
              <ul class="trace-list" data-role="thought-list"></ul>
            </div>
            <div class="detail-card">
              <h4>Analysis</h4>
              <p data-role="analysis">${escapeHtml(initialStep?.analysis || 'No step analysis recorded.')}</p>
            </div>
            <div class="detail-card">
              <h4>Trace</h4>
              <ul class="trace-list" data-role="trace-list"></ul>
            </div>
            <div class="detail-card">
              <h4>Meta</h4>
              <ul>
                <li>Status: <span data-role="status">${initialStep?.success ? 'Success' : 'Failure'}</span></li>
                <li>Duration: <span data-role="duration">${formatDuration(initialStep?.durationMs || 0)}</span></li>
                <li>Timestamp: <span data-role="timestamp">${escapeHtml(initialStep?.timestamp || 'Unknown')}</span></li>
                <li>Error: <span data-role="error">${escapeHtml(initialStep?.errorMessage || 'No error recorded.')}</span></li>
              </ul>
            </div>
            <div class="detail-card">
              <h4>Raw Artifacts</h4>
              <div class="artifact-list" data-role="raw-links"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="raw-links">
        <details>
          <summary>Raw Artifact Links</summary>
          <div class="artifact-list">
            <div class="artifact-row"><a href="${escapeHtml(spec.resultJsonPath)}">result.json</a></div>
            ${spec.recordingFile
              ? `<div class="artifact-row"><span>Session</span><a href="${escapeHtml(spec.recordingFile)}">recording</a></div>`
              : ''}
            ${spec.steps.map((step) => `
              <div class="artifact-row">
                <span>Step ${step.stepNumber}</span>
                <a href="${escapeHtml(step.stepJsonFile || '#')}">step.json</a>
                ${step.screenshotFile ? `<a href="${escapeHtml(step.screenshotFile)}">screenshot</a>` : '<span class="muted">no screenshot</span>'}
              </div>
            `).join('')}
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderStepButton(specId: string, step: RunManifestStepRecord, index: number): string {
  const isFailure = !step.success;
  return `
    <button
      class="step-button ${index === 0 ? 'is-selected' : ''}"
      data-spec-id="${escapeHtml(specId)}"
      data-step-index="${index}"
      onclick="selectStep('${escapeJs(specId)}', ${index})"
      type="button"
    >
      <div class="step-row">
        <div class="step-icon ${isFailure ? 'failure' : 'success'}">${isFailure ? '!' : '✓'}</div>
        <div>
          <div class="step-title">${escapeHtml(step.naturalLanguageAction || step.actionType)}</div>
          <div class="step-meta">
            <span>${escapeHtml(step.actionType)}</span>
            <span>${escapeHtml(step.timestamp || 'Unknown time')}</span>
          </div>
        </div>
        <div class="duration-chip">${formatDuration(step.durationMs || step.trace?.totalMs || 0)}</div>
      </div>
    </button>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds >= 10 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
}

function renderVariables(manifest: RunManifestRecord): string {
  const entries = Object.entries(manifest.input.environment.variables);
  if (entries.length === 0) {
    return '<span class="muted">No variables recorded.</span>';
  }
  return entries
    .map(([key, value]) => `<code>${escapeHtml(key)}=${escapeHtml(String(value))}</code>`)
    .join(' · ');
}

function renderSecretReferences(manifest: RunManifestRecord): string {
  const references = manifest.input.environment.secretReferences;
  if (references.length === 0) {
    return '<span class="muted">No secrets recorded.</span>';
  }
  return references
    .map((reference) => `<code>${escapeHtml(reference.key)} ← ${escapeHtml(reference.envVar)}</code>`)
    .join(' · ');
}

function resolveRunTarget(manifest: RunManifestRecord): RunTargetRecord {
  return manifest.run.target ?? { type: 'direct' };
}

function formatRunTarget(target: RunTargetRecord): string {
  return target.type === 'suite' ? 'Suite' : 'Direct';
}

function renderSuiteManifestLink(manifest: RunManifestRecord): string {
  if (!manifest.input.suite?.snapshotYamlPath) {
    return '<span class="muted">No suite manifest snapshot recorded.</span>';
  }

  const label = manifest.run.target?.suitePath ?? manifest.input.suite.snapshotYamlPath;
  return `<a href="${escapeHtml(manifest.input.suite.snapshotYamlPath)}">${escapeHtml(label)}</a>`;
}

function renderSuiteTests(manifest: RunManifestRecord): string {
  const tests = manifest.input.suite?.tests ?? [];
  if (tests.length === 0) {
    return '<span class="muted">No suite tests recorded.</span>';
  }

  return tests.map((entry) => `<code>${escapeHtml(entry)}</code>`).join(' · ');
}

function formatVideoTimestamp(videoOffsetMs: number | undefined): string {
  if (videoOffsetMs === undefined) {
    return '00:00.0';
  }

  const totalSeconds = Math.max(0, videoOffsetMs / 1000);
  const minutesPart = Math.floor(totalSeconds / 60);
  const secondsPart = totalSeconds - minutesPart * 60;
  return `${String(minutesPart).padStart(2, '0')}:${secondsPart.toFixed(1).padStart(4, '0')}`;
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

export function renderRunNotFoundHtml(runId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Run Not Found</title>
</head>
<body>
  <main>
    <h1>Run Not Found</h1>
    <p>No run manifest was found for <code>${escapeHtml(runId)}</code>.</p>
    <p><a href="${buildRunRoute('..')}">Back to reports</a></p>
  </main>
</body>
</html>`;
}
