import type {
  RunManifestRecord,
  RunManifestSpecRecord,
  RunManifestStepRecord,
} from '@finalrun/common';

export function renderHtmlReport(manifest: RunManifestRecord): string {
  const dataJson = JSON.stringify(manifest).replace(/</g, '\\u003c');
  const run = manifest.run;
  const specs = manifest.specs;
  const target = resolveRunTarget(manifest);

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

    .media-shell {
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

    .recording-shell {
      min-height: 260px;
    }

    .media-shell img {
      max-width: 100%;
      max-height: 620px;
      border-radius: 24px;
      border: 6px solid #111827;
      background: white;
      object-fit: contain;
    }

    .recording-shell video {
      width: 100%;
      max-height: 480px;
      border-radius: 18px;
      background: #0f172a;
      object-fit: contain;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
    }

    .recording-meta {
      margin-top: 10px;
      font-size: 13px;
      color: var(--muted);
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
        <div class="meta-card"><strong>Artifacts</strong><span><a href="run.json">run.json</a> · <a href="summary.json">summary.json</a> · <a href="runner.log">runner.log</a></span></div>
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
            <td>${renderSuiteManifestLink(manifest)}</td>
          </tr>
          <tr>
            <th>Suite Tests</th>
            <td>${renderSuiteTests(manifest)}</td>
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
            <td>${renderVariables(manifest)}</td>
          </tr>
          <tr>
            <th>Secrets</th>
            <td>${renderSecretReferences(manifest)}</td>
          </tr>
          <tr>
            <th>Spec Snapshots</th>
            <td>${manifest.input.specs.length > 0 ? manifest.input.specs.map((spec) => `<a href="${escapeHtml(spec.snapshotYamlPath)}">${escapeHtml(spec.relativePath)}</a>`).join(' · ') : '<span class="muted">No spec snapshots recorded.</span>'}</td>
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

    function syncRecording(container, spec, step) {
      const video = container.querySelector('[data-role="recording-video"]');
      const empty = container.querySelector('[data-role="empty-recording"]');
      const label = container.querySelector('[data-role="recording-caption"]');

      if (!video) {
        return;
      }

      if (!spec.recordingFile) {
        if (empty) empty.style.display = 'block';
        video.style.display = 'none';
        if (label) label.textContent = 'No session recording was captured for this spec.';
        return;
      }

      if (empty) empty.style.display = 'none';
      video.style.display = 'block';

      if (step.videoOffsetMs === undefined || step.videoOffsetMs === null) {
        video.pause();
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
              ? `<video data-role="recording-video" controls preload="metadata" src="${escapeHtml(spec.recordingFile)}"></video>`
              : '<div class="empty-shot" data-role="empty-recording">No session recording was captured for this spec.</div>'}
            ${spec.recordingFile
              ? '<div class="empty-shot" data-role="empty-recording" style="display:none">No session recording was captured for this spec.</div>'
              : ''}
          </div>
          <div class="recording-meta" data-role="recording-caption">
            ${spec.recordingFile
              ? `Paused at ${formatVideoTimestamp(initialStep?.videoOffsetMs)} for the selected step.`
              : 'No session recording was captured for this spec.'}
          </div>
          <h3>Selected Step</h3>
          <div class="media-shell">
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

function resolveRunTarget(manifest: RunManifestRecord): {
  type: 'direct' | 'suite';
  suiteId?: string;
  suiteName?: string;
  suitePath?: string;
} {
  return manifest.run.target ?? { type: 'direct' };
}

function formatRunTarget(target: {
  type: 'direct' | 'suite';
}): string {
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
