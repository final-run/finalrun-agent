import type { RunSummaryRecord, SpecArtifactRecord, StepArtifactRecord } from '@finalrun/common';

export function renderHtmlReport(params: {
  summary: RunSummaryRecord;
  specs: SpecArtifactRecord[];
}): string {
  const dataJson = JSON.stringify(params).replace(/</g, '\\u003c');

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
      --mono: "SFMono-Regular", "SF Mono", "Roboto Mono", monospace;
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
      background: var(--accent-soft);
      border-color: var(--accent);
    }

    .step-button.is-setup {
      background: var(--panel-alt);
    }

    .step-row {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      gap: 12px;
      align-items: start;
    }

    .step-icon {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      background: var(--success-soft);
      color: var(--success);
    }

    .step-icon.failure {
      background: var(--danger-soft);
      color: var(--danger);
    }

    .step-title {
      font-size: 15px;
      font-weight: 700;
      line-height: 1.45;
      margin-bottom: 6px;
    }

    .step-meta {
      font-size: 12px;
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .duration-chip {
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: #edf2f7;
      color: var(--muted);
      border: 1px solid var(--border);
      white-space: nowrap;
    }

    .detail-panel {
      padding: 20px 24px 24px;
      overflow: auto;
    }

    .screenshot-shell {
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(180deg, #fbfdff 0%, #edf2f7 100%);
      min-height: 360px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      overflow: hidden;
    }

    .screenshot-shell img {
      max-width: 100%;
      max-height: 620px;
      border-radius: 24px;
      border: 6px solid #111827;
      background: white;
      object-fit: contain;
    }

    .empty-shot {
      color: var(--muted);
      text-align: center;
      font-size: 14px;
      line-height: 1.6;
    }

    .detail-grid {
      margin-top: 18px;
      display: grid;
      gap: 14px;
    }

    .detail-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      background: var(--panel);
    }

    .detail-card h4 {
      margin: 0 0 10px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }

    .detail-card p,
    .detail-card pre,
    .detail-card li {
      margin: 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .detail-card ul {
      margin: 0;
      padding-left: 18px;
    }

    .raw-links {
      padding: 0 24px 24px;
    }

    .raw-links details {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      background: var(--panel);
    }

    .raw-links summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 12px;
    }

    .artifact-list {
      display: grid;
      gap: 8px;
      font-family: var(--mono);
      font-size: 12px;
    }

    .artifact-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      padding: 8px 0;
      border-top: 1px solid var(--border);
    }

    .artifact-row:first-child {
      border-top: none;
      padding-top: 0;
    }

    .trace-list {
      display: grid;
      gap: 8px;
    }

    .trace-list li {
      list-style: none;
      padding: 8px 10px;
      border-radius: 10px;
      background: var(--panel-alt);
      border: 1px solid var(--border);
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 1fr;
      }

      .timeline-panel {
        border-right: none;
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
          <p>Run ID: ${escapeHtml(params.summary.runId)}</p>
        </div>
        <div class="status-pill ${params.summary.success ? 'success' : 'failure'}">
          ${params.summary.success ? 'Passed' : 'Failed'}
        </div>
      </div>
      <div class="meta-grid">
        <div class="meta-card"><strong>Environment</strong><span>${escapeHtml(params.summary.envName)}</span></div>
        <div class="meta-card"><strong>Platform</strong><span>${escapeHtml(params.summary.platform)}</span></div>
        <div class="meta-card"><strong>Started</strong><span>${escapeHtml(params.summary.startedAt)}</span></div>
        <div class="meta-card"><strong>Duration</strong><span>${formatDuration(params.summary.durationMs)}</span></div>
        <div class="meta-card"><strong>Specs</strong><span>${params.summary.specCount}</span></div>
        <div class="meta-card"><strong>Artifacts</strong><span><a href="summary.json">summary.json</a> · <a href="runner.log">runner.log</a></span></div>
      </div>
    </section>

    <section class="spec-index">
      <h2>Spec Index</h2>
      <table>
        <thead>
          <tr>
            <th>Spec</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Path</th>
          </tr>
        </thead>
        <tbody>
          ${params.specs.map((spec) => `
            <tr>
              <td><a href="#spec-${escapeHtml(spec.specId)}">${escapeHtml(spec.specName)}</a></td>
              <td>${spec.success ? 'Passed' : 'Failed'}</td>
              <td>${formatDuration(spec.durationMs)}</td>
              <td>${escapeHtml(spec.relativePath)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>

    ${params.specs.map((spec) => renderSpecSection(spec)).join('')}
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
          const detail = span.detail ? ' — ' + span.detail : '';
          li.textContent = span.name + ': ' + formatDuration(span.durationMs) + ' (' + span.status + ')' + detail;
          traceList.appendChild(li);
        }
      }

      const rawLinks = container.querySelector('[data-role="raw-links"]');
      rawLinks.innerHTML = '';
      const links = [
        step.stepJsonFile ? ['step.json', step.stepJsonFile] : null,
        step.screenshotFile ? ['screenshot', step.screenshotFile] : null,
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

    for (const spec of reportPayload.specs) {
      if (spec.steps.length > 0) {
        selectStep(spec.specId, 0);
      }
    }
  </script>
</body>
</html>`;
}

function renderSpecSection(spec: SpecArtifactRecord): string {
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
          <h3>Selected Step</h3>
          <div class="screenshot-shell">
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
            <div class="artifact-row"><a href="tests/${escapeHtml(spec.specId)}/result.json">result.json</a></div>
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

function renderStepButton(specId: string, step: StepArtifactRecord, index: number): string {
  const isFailure = !step.success;
  const isSetup = step.actionType === 'launchApp';
  return `
    <button
      class="step-button ${index === 0 ? 'is-selected' : ''} ${isSetup ? 'is-setup' : ''}"
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
