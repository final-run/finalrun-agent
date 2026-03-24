import type { RunIndexRecord } from '@finalrun/common';

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
            <td><strong>\${escapeHtml(run.runId)}</strong><div class="muted">\${escapeHtml(run.modelLabel)}</div></td>
            <td>\${escapeHtml(run.envName)}</td>
            <td>\${escapeHtml(run.platform)}</td>
            <td>\${run.passedCount}/\${run.specCount} passed</td>
            <td>\${formatDuration(run.durationMs)}</td>
            <td>\${escapeHtml(firstFailure)}</td>
            <td><a href="\${escapeHtml(run.paths.html)}">report</a> · <a href="\${escapeHtml(run.paths.log)}">log</a> · <a href="\${escapeHtml(run.paths.runJson)}">run.json</a></td>
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

    searchInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    render();
  </script>
</body>
</html>`;
}
