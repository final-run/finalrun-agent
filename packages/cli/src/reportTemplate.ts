import type {
  RunManifestRecord,
  RunManifestSelectedSpecRecord,
  RunManifestSpecRecord,
  RunManifestStepRecord,
  RunTargetRecord,
} from '@finalrun/common';

const TEST_ICON_SRC =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEYAAABHCAYAAAC6cjEhAAAACXBIWXMAACxLAAAsSwGlPZapAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAARRSURBVHgB7ZxbbtNAFIbPJKroA0J9bMUDWQLdQXpB4g26goYVlK6gzQpoV0BYAelbJdLWrKDZAeYBmjcqARIoTYbzj+M0F9vxZcYek35SldSOlfjz8Zy5nITogfKyuy6Pdjbkj511+WV7Q76lHBBkOSylLomuZjY3LnriAxmkQpbDV64WsLnF0bNPBrFeTH+V2vzgBuwyKsd6MY4rbgdEW5SzHOvFAKcnXCFU5ARhRE4pxCArSUlR2Ui7nDJkpSPOSscxX64tW1kdMRFScPJuwHZtkWOtmCgpHBWNqAYZfR/KiJViFknBEzTIgyrtcWNwO/siKejji6fyOWXAujYmTApnpW7nRmzObq+zgOqQe8aS1qYPoNtKhbY+fRNdSoFVERMl5e6RunXmcPjEByxgLnJY1JCFpY0cayJmkRR09KKO1x05VojJKsVHp5zCxeiS4qNLTqFidEvx0SGnMDGmpPhEyVmRtHnO6T7q+EKykmkpANmKx1eHcztYVJ8nvl6uy1rU8blHTETnzUVv1llwJZOyvS4bfJLvg95vhd8vLHJyFcPztgd8xU4CdhmR4pNGTm5iRoO7VsAuo1J8ksrJRUzRUnySyDEuxhYpPnHlGM1KtkkBlz3R4tH3YcCu2mS2MhYxEVKAy38OZ6fPT3gVoK0hPcfldU2u/fpLV5zKwwaXKnKMiFkgZRqMiiW1+cM0zw1HUAwpPq52MYmkzNMyJSiBFIVWMSHLqWnQLmh3Q14HSeHP26x4j0eT27WJwYTQMGhskh6XU8PhxXfRpoxwFCMLNWa3Qwo3xsd4zhf1mP/fZyNrLKWpRYwBKWMwfOAP36SUxJESRGYxJqVM4OJEkmawtFJAJjE5SbnHm9dVab4iqft4lbqzotDI/u5TbTigA0opxXurlOQuRQNxpYBUYv53KSCxmGWQAhKJwTiiL+i6TFL4DE8vbkTiur3YYpQUr/NWo/IwXtJNSiwxyyYFLBSzjFJApJhllQJCxSyzFBAoZtmlgDkx6FL//MMpeYmlgLk5X5byjkokBauXuqWAKTGj2rUGlYSogqKsTEeMUNFSCnSucwcxFqOmJWPOhxaNaSlgLEZN65WAPKSAyVupTpaTlxSgxIwqG2tkMXlKAUrMUD5ImUWJkXaLcfOWApSYir0TT97if85SgHcrBdTjW0BhFRFAialK68QUKgV46bpKsSumc6BwKUCJ6a8Efu+nCKyQApQYNG48/+BQsVgjBYx7vtwAn1FxWCUF3It5RC0qJjtZJwWMxajbSdIp5YuVUsDUfMzdqqradikfrJUCpsSMGuE3ZB6rpYC5Od9OTzghdbC6sF4KCCyAvrwRJ6hDI/2UQgoIrQzvoGyiQnukqc1BP6ksUsDCtes6L75Vve8XpZv65C4Aoq/DUUglInYZyFiQoFdx6mMwucSvO0OmK2LaICupSs1G608odn7m/1SS9DqHX1E0yMu7TllumTD+AWEyp4L85hdWAAAAAElFTkSuQmCC';

type SpecOutcomeStatus = 'success' | 'failure' | 'error' | 'not_executed';

interface ReportSpecListItem {
  input: RunManifestSelectedSpecRecord;
  executed?: RunManifestSpecRecord;
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

export function renderHtmlReport(manifest: RunManifestRecord): string {
  const run = manifest.run;
  const specItems = buildSpecListItems(manifest);
  const isSingleSpec = specItems.length <= 1;
  const outcomeSummary = summarizeSpecItems(specItems);
  const initialSpec = specItems[0];
  const reportTitle = deriveReportTitle(manifest);
  const reportPayload = JSON.stringify(manifest).replace(/</g, '\\u003c');

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

    .run-context-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
    }

    .context-card {
      padding: 16px 18px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: var(--panel-alt);
    }

    .context-card strong {
      display: block;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }

    .context-card span,
    .context-card div,
    .context-card code {
      color: var(--text);
      font-size: 14px;
      line-height: 1.55;
      word-break: break-word;
    }

    .inline-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .inline-code {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border-radius: 999px;
      background: white;
      border: 1px solid rgba(188, 197, 225, 0.8);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace;
      font-size: 12px;
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

    .goal-shell {
      padding: 0 24px 24px;
    }

    .goal-card {
      padding: 18px 20px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: white;
    }

    .goal-card strong {
      display: block;
      margin-bottom: 10px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .goal-copy {
      color: var(--text);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.55;
    }

    .goal-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 14px;
    }

    .goal-chip {
      padding: 7px 10px;
      border-radius: 999px;
      background: var(--panel-alt);
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
    }

    .workspace {
      display: grid;
      grid-template-columns: minmax(320px, 0.95fr) minmax(420px, 1.05fr);
      min-height: 560px;
      border-top: 1px solid var(--border-light);
    }

    .timeline-panel {
      padding: 22px;
      border-right: 1px solid var(--border-light);
      background: white;
    }

    .detail-panel {
      padding: 22px;
      background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(244,247,254,0.96) 100%);
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
      margin: 0 0 12px;
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

    .step-reason {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .step-meta {
      margin-top: 6px;
      color: var(--icon);
      font-size: 12px;
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
      width: min(100%, 360px);
      margin: 0 auto 16px;
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
      width: min(100%, 360px);
      margin: -4px auto 18px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: white;
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
      background: white;
      color: var(--text);
      cursor: pointer;
    }

    .recording-icon-button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
    }

    .recording-icon-button svg {
      width: 18px;
      height: 18px;
      display: block;
      fill: currentColor;
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

    .recording-meta {
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      text-align: center;
    }

    .muted {
      color: var(--muted);
    }

    @media (max-width: 980px) {
      .workspace {
        grid-template-columns: 1fr;
      }

      .timeline-panel {
        border-right: 0;
        border-bottom: 1px solid var(--border-light);
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
      ? renderSingleSpecPage(manifest, initialSpec)
      : renderSuiteRunPage(manifest, specItems, outcomeSummary)}
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
        shell.style.setProperty('--recording-aspect-ratio', String(video.videoWidth) + ' / ' + String(video.videoHeight));
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
      playPause.setAttribute('aria-label', video.paused || video.ended ? 'Play recording' : 'Pause recording');
      playPause.setAttribute('title', video.paused || video.ended ? 'Play recording' : 'Pause recording');
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
  manifest: RunManifestRecord,
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

  return `
    <section class="overview-grid">
      ${renderRunContextPanel(manifest)}
      ${renderSpecDetailSection(item, true)}
    </section>
  `;
}

function renderSuiteRunPage(
  manifest: RunManifestRecord,
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
    ${items.map((item) => renderSpecDetailSection(item, false, suiteLabel)).join('')}
  `;
}

function renderRunContextPanel(manifest: RunManifestRecord): string {
  const target = resolveRunTarget(manifest);
  const artifacts = [
    `<a href="${escapeHtml(manifest.paths.runJson)}">run.json</a>`,
    `<a href="${escapeHtml(manifest.paths.summaryJson)}">summary.json</a>`,
    `<a href="${escapeHtml(manifest.paths.log)}">runner.log</a>`,
  ];
  if (manifest.paths.runContextJson) {
    artifacts.push(`<a href="${escapeHtml(manifest.paths.runContextJson)}">run-context.json</a>`);
  }

  return `
    <section class="overview-panel">
      <div class="overview-panel-body">
        <h2 class="overview-title">Run Context</h2>
        <p class="overview-subtitle">Inputs and environment captured for this report.</p>
        <div class="run-context-grid">
          ${renderContextCard('Environment', escapeHtml(manifest.input.environment.envName))}
          ${renderContextCard('Platform', escapeHtml(manifest.run.platform))}
          ${renderContextCard('Model', escapeHtml(manifest.run.model.label))}
          ${renderContextCard('App', escapeHtml(manifest.run.app.label))}
          ${renderContextCard('Run Target', escapeHtml(formatRunTarget(target)))}
          ${target.type === 'suite'
            ? renderContextCard(
              'Suite',
              target.suitePath && target.suiteName
                ? `<div>${escapeHtml(target.suiteName)}</div><div class="muted">${escapeHtml(target.suitePath)}</div>`
                : escapeHtml(target.suiteName || target.suitePath || 'Suite run'),
            )
            : renderContextCard(
              'Selectors',
              manifest.run.selectors.length > 0
                ? renderInlineCodeList(manifest.run.selectors)
                : '<span class="muted">No selectors recorded.</span>',
            )}
          ${renderContextCard('Variables', renderVariableList(manifest))}
          ${renderContextCard('Secrets', renderSecretList(manifest))}
          ${renderContextCard('Artifacts', `<div class="inline-list">${artifacts.join(' · ')}</div>`)}
        </div>
      </div>
    </section>
  `;
}

function renderContextCard(label: string, content: string): string {
  return `
    <div class="context-card">
      <strong>${escapeHtml(label)}</strong>
      <div>${content}</div>
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
): string {
  const detailClass = visible ? 'detail-shell is-visible' : 'detail-shell';
  const detailSubtitle = parentLabel
    ? `${parentLabel} · ${item.input.relativePath}`
    : item.input.relativePath;

  if (!item.executed) {
    return `
      <section class="${detailClass}" data-spec-panel="${escapeHtml(item.input.specId)}">
        <div class="detail-header">
          <div class="detail-header-main">
            <div class="detail-header-copy">
              <h2>${escapeHtml(item.input.specName)}</h2>
              <p>${escapeHtml(detailSubtitle)}</p>
            </div>
          </div>
          ${renderStatusPill('not_executed')}
        </div>
        <div class="detail-meta">
          <div class="detail-meta-card"><strong>Status</strong><span>Not executed</span></div>
          <div class="detail-meta-card"><strong>Duration</strong><span>NA</span></div>
          <div class="detail-meta-card"><strong>Path</strong><span>${escapeHtml(item.input.relativePath)}</span></div>
        </div>
        <div class="goal-shell">
          <div class="empty-panel">
            This spec was selected for the run, but it never started. The batch ended before this spec could execute, so there are no step artifacts for it.
          </div>
        </div>
      </section>
    `;
  }

  const spec = item.executed;
  const initialStep = spec.steps[0];
  const statusText = item.status === 'error' ? 'Error' : item.status === 'failure' ? 'Failed' : 'Passed';
  const goalText = spec.effectiveGoal || deriveGoalFallback(spec);
  const analysisText = spec.analysis || spec.message || 'No overall analysis recorded.';

  return `
    <section class="${detailClass}" data-spec-panel="${escapeHtml(spec.specId)}">
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
        <div class="detail-meta-card"><strong>Duration</strong><span>${escapeHtml(formatLongDuration(spec.durationMs))}</span></div>
        <div class="detail-meta-card"><strong>Steps</strong><span>${spec.steps.length} recorded</span></div>
        <div class="detail-meta-card"><strong>Analysis</strong><span>${escapeHtml(analysisText)}</span></div>
      </div>

      <div class="goal-shell">
        <div class="goal-card">
          <strong>Goal</strong>
          <div class="goal-copy">${escapeHtml(goalText)}</div>
          <div class="goal-chip-row">
            <span class="goal-chip">${spec.authored.steps.length} authored steps</span>
            <span class="goal-chip">${spec.authored.assertions.length} assertions</span>
            <span class="goal-chip">${spec.recordingFile ? 'Recording available' : 'No recording'}</span>
          </div>
        </div>
      </div>

      <div class="workspace">
        <div class="timeline-panel">
          <p class="section-label">Agent Actions</p>
          ${spec.steps.length > 0
            ? spec.steps.map((step, index) => renderStepButton(spec.specId, step, index)).join('')
            : '<div class="empty-panel">No steps were recorded for this spec.</div>'}
        </div>

        <div class="detail-panel" data-step-detail="${escapeHtml(spec.specId)}">
          <p class="section-label">Session Recording</p>
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
            ${!spec.recordingFile
              ? 'No session recording was captured for this spec.'
              : !initialStep
                ? 'No recorded actions are available for this spec.'
                : initialStep.videoOffsetMs === undefined || initialStep.videoOffsetMs === null
                  ? 'No synced recording timestamp is available for the selected step.'
                  : `Paused at ${formatVideoTimestamp(initialStep.videoOffsetMs)} for the selected step.`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderStepButton(specId: string, step: RunManifestStepRecord, index: number): string {
  const statusClass = step.success ? 'success' : step.actionType === 'run_failure' ? 'error' : 'failure';
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
        <div>
          <div class="step-title">${escapeHtml(step.naturalLanguageAction || step.actionType)}</div>
          <div class="step-reason">${escapeHtml(step.reason || 'No rationale recorded.')}</div>
          <div class="step-meta">${escapeHtml(step.timestamp || 'Unknown time')}</div>
        </div>
        <div class="duration-chip">${escapeHtml(formatStepDuration(step.durationMs || step.trace?.totalMs || 0))}</div>
      </div>
    </button>
  `;
}

function buildSpecListItems(manifest: RunManifestRecord): ReportSpecListItem[] {
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

function classifySpecStatus(spec: RunManifestSpecRecord): SpecOutcomeStatus {
  if (spec.success) {
    return 'success';
  }
  if (spec.steps[0]?.actionType === 'run_failure') {
    return 'error';
  }
  return 'failure';
}

function deriveReportTitle(manifest: RunManifestRecord): string {
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

function deriveGoalFallback(spec: RunManifestSpecRecord): string {
  const parts = [
    ...spec.authored.preconditions,
    ...spec.authored.setup,
    ...spec.authored.steps,
    ...spec.authored.assertions.map((assertion) => `Assert: ${assertion}`),
  ].filter((part) => part.trim().length > 0);
  return parts.length > 0 ? parts.join(' ') : spec.message;
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

function renderVariableList(manifest: RunManifestRecord): string {
  const entries = Object.entries(manifest.input.environment.variables);
  if (entries.length === 0) {
    return '<span class="muted">No variables recorded.</span>';
  }
  return renderInlineCodeList(entries.map(([key, value]) => `${key}=${String(value)}`));
}

function renderSecretList(manifest: RunManifestRecord): string {
  const references = manifest.input.environment.secretReferences;
  if (references.length === 0) {
    return '<span class="muted">No secrets recorded.</span>';
  }
  return renderInlineCodeList(references.map((reference) => `${reference.key} ← ${reference.envVar}`));
}

function renderInlineCodeList(values: string[]): string {
  return `<span class="inline-list">${values
    .map((value) => `<code class="inline-code">${escapeHtml(value)}</code>`)
    .join('')}</span>`;
}

function resolveRunTarget(manifest: RunManifestRecord): RunTargetRecord {
  return manifest.run.target ?? { type: 'direct' };
}

function formatRunTarget(target: RunTargetRecord): string {
  return target.type === 'suite' ? 'Suite' : 'Direct';
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
    return '00:00.0';
  }
  const totalSeconds = Math.max(0, videoOffsetMs / 1000);
  const minutesPart = Math.floor(totalSeconds / 60);
  const secondsPart = totalSeconds - minutesPart * 60;
  return `${String(minutesPart).padStart(2, '0')}:${secondsPart.toFixed(1).padStart(4, '0')}`;
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

    .run-secondary {
      margin-top: 3px;
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 900px) {
      .page {
        padding: 20px;
      }
    }
  `;
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
