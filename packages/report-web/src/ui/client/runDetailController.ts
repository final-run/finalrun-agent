// Interactive controller for the run detail page. Extracted verbatim from the
// legacy renderers.ts inline <script> block. Behavior is unchanged — only the
// entry point differs: init(payload) replaces the original
// `JSON.parse(document.getElementById('finalrun-report-data').textContent)`.
//
// Public API:
//   - initRunDetailController(payload) -> cleanup()
//   - switchTab / selectTest / selectStep / clearTestSelection / handlePrimaryBack / handleLogFilter
//     are wired from React onClick handlers in the JSX tree.
//
// Kept un-idiomatic on purpose. Refactoring state to React hooks is a follow-
// up PR once parity is proven.

type ReportPayloadTest = {
  testId: string;
  steps: ReportPayloadStep[];
  recordingFile?: string | null;
};

type ReportPayloadStep = {
  videoOffsetMs?: number | null;
  screenshotFile?: string | null;
};

type ReportPayload = {
  tests: ReportPayloadTest[];
};

let payload: ReportPayload = { tests: [] };
let testMap: Record<string, ReportPayloadTest> = {};

export function initRunDetailController(next: ReportPayload): () => void {
  payload = next;
  testMap = Object.fromEntries(payload.tests.map((test) => [test.testId, test]));

  document.addEventListener('click', handleLogLineClick);
  document.addEventListener('input', handleInputDelegation);
  document.addEventListener('keydown', handleCmdF);

  const logInlines = document.querySelectorAll('.device-log-inline');
  for (let li = 0; li < logInlines.length; li++) {
    const countEl = logInlines[li].querySelector('.device-log-match-count');
    const total = logInlines[li].querySelectorAll('.device-log-line').length;
    if (countEl) countEl.textContent = total + ' lines';
  }

  updatePrimaryBackButton();

  for (const test of payload.tests) {
    if (test.steps.length > 0) {
      selectStep(test.testId, 0);
    }
  }

  return () => {
    document.removeEventListener('click', handleLogLineClick);
    document.removeEventListener('input', handleInputDelegation);
    document.removeEventListener('keydown', handleCmdF);
  };
}

export function switchTab(button: HTMLElement): void {
  const panel = button.closest('.tabs-panel');
  if (!panel) return;
  const tabName = (button as HTMLElement).dataset.tab;
  for (const btn of panel.querySelectorAll('.tab-button')) {
    btn.classList.toggle('is-active', (btn as HTMLElement).dataset.tab === tabName);
  }
  for (const content of panel.querySelectorAll('.tab-content')) {
    content.classList.toggle('is-active', (content as HTMLElement).dataset.tabContent === tabName);
  }
  if (tabName === 'logs') {
    const container = panel.closest('[data-step-detail]') as HTMLElement | null;
    const video = container ? (container.querySelector('[data-role="recording-video"]') as HTMLVideoElement | null) : null;
    if (container && video && Number.isFinite(video.currentTime)) {
      highlightNearestLogLine(container, video.currentTime);
    }
  }
}

export function clearTestSelection(): void {
  const overview = document.getElementById('suite-overview');
  if (overview) {
    overview.style.display = 'block';
  }
  for (const panel of document.querySelectorAll('[data-test-panel]')) {
    panel.classList.remove('is-visible');
  }
  updatePrimaryBackButton();
}

export function selectTest(testId: string): void {
  const overview = document.getElementById('suite-overview');
  if (overview) {
    overview.style.display = 'none';
  }
  for (const panel of document.querySelectorAll('[data-test-panel]')) {
    panel.classList.toggle('is-visible', (panel as HTMLElement).dataset.testPanel === testId);
  }
  if (testMap[testId] && testMap[testId].steps.length > 0) {
    selectStep(testId, 0);
  }
  updatePrimaryBackButton();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hasVisibleTestPanel(): boolean {
  for (const panel of document.querySelectorAll('[data-test-panel]')) {
    if (panel.classList.contains('is-visible')) {
      return true;
    }
  }
  return false;
}

function updatePrimaryBackButton(): void {
  const button = document.getElementById('primary-back-button');
  if (!button) {
    return;
  }
  const label = hasVisibleTestPanel() ? 'Back to suite overview' : 'Back to run history';
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
}

export function handlePrimaryBack(event: Event): boolean {
  if (!hasVisibleTestPanel()) {
    return true;
  }
  event.preventDefault();
  clearTestSelection();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return false;
}

export function selectStep(testId: string, stepIndex: number): void {
  const test = testMap[testId];
  const step = test?.steps?.[stepIndex];
  const container = document.querySelector('[data-step-detail="' + testId + '"]') as HTMLElement | null;
  if (!container || !step) {
    return;
  }

  setSelectedStep(testId, stepIndex);
  syncRecording(container, test, step);
}

function setSelectedStep(testId: string, stepIndex: number): void {
  for (const button of document.querySelectorAll('[data-test-id="' + testId + '"][data-step-index]')) {
    button.classList.toggle('is-selected', Number((button as HTMLElement).dataset.stepIndex) === stepIndex);
  }
}

function selectNearestStepForTime(testId: string, targetSeconds: number): void {
  const test = testMap[testId];
  if (!test) {
    return;
  }

  const nearestStepIndex = findNearestStepIndex(test, targetSeconds);
  if (nearestStepIndex === null) {
    return;
  }

  const step = test.steps[nearestStepIndex];
  const container = document.querySelector('[data-step-detail="' + testId + '"]') as HTMLElement | null;
  if (!container || !step) {
    return;
  }

  setSelectedStep(testId, nearestStepIndex);
  updateRecordingCaption(container, test, step, targetSeconds);
}

function findNearestStepIndex(test: ReportPayloadTest, targetSeconds: number): number | null {
  let nearestIndex: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [index, step] of test.steps.entries()) {
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

function formatVideoClock(totalSeconds: number): string {
  const wholeSeconds = Math.floor(Math.max(0, Number(totalSeconds || 0)));
  const minutesPart = Math.floor(wholeSeconds / 60);
  const secondsPart = wholeSeconds % 60;
  return String(minutesPart).padStart(2, '0') + ':' + String(secondsPart).padStart(2, '0');
}

function highlightNearestLogLine(container: HTMLElement, targetSeconds: number): void {
  const logContainer = container.querySelector('.device-log-inline') as HTMLElement | null;
  if (!logContainer) return;
  const recordingStarted = logContainer.dataset.recordingStarted;
  if (!recordingStarted) return;

  const recStartMs = new Date(recordingStarted).getTime();
  if (!Number.isFinite(recStartMs)) return;

  let nearest: HTMLElement | null = null;
  let nearestDist = Infinity;

  const lines = logContainer.querySelectorAll('.device-log-line[data-log-ts]:not(.is-hidden)');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as HTMLElement;
    const ts = line.dataset.logTs;
    if (!ts) continue;
    const lineMs = new Date(ts).getTime();
    if (!Number.isFinite(lineMs)) continue;
    const lineSeconds = Math.max(0, (lineMs - recStartMs) / 1000);
    const dist = Math.abs(lineSeconds - targetSeconds);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = line;
    }
  }

  const active = logContainer.querySelectorAll('.device-log-line.is-active');
  for (let j = 0; j < active.length; j++) {
    active[j].classList.remove('is-active');
  }
  if (nearest) {
    nearest.classList.add('is-active');
    nearest.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function handleLogLineClick(event: Event): void {
  const target = event.target as HTMLElement | null;
  const line = target?.closest('.device-log-line') as HTMLElement | null;
  if (!line) return;
  const logTs = line.dataset.logTs;
  if (!logTs) return;

  const container = line.closest('.workspace') as HTMLElement | null;
  if (!container) return;

  const logContainer = line.closest('.device-log-inline') as HTMLElement | null;
  const recordingStarted = logContainer ? logContainer.dataset.recordingStarted : null;
  if (!recordingStarted) return;

  const logTimeMs = new Date(logTs).getTime();
  const recStartMs = new Date(recordingStarted).getTime();
  if (!Number.isFinite(logTimeMs) || !Number.isFinite(recStartMs)) return;

  const offsetSeconds = Math.max(0, (logTimeMs - recStartMs) / 1000);

  const video = container.querySelector('[data-role="recording-video"]') as HTMLVideoElement | null;
  if (video) {
    const anyVideo = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
    if (typeof anyVideo.fastSeek === 'function') {
      anyVideo.fastSeek(offsetSeconds);
    } else {
      video.currentTime = offsetSeconds;
    }
  }

  const seekbar = container.querySelector('[data-role="recording-seekbar"]') as HTMLInputElement | null;
  if (seekbar) {
    seekbar.value = String(offsetSeconds);
  }

  const currentDisplay = container.querySelector('[data-role="recording-current"]') as HTMLElement | null;
  if (currentDisplay) {
    currentDisplay.textContent = formatVideoClock(offsetSeconds);
  }

  if (logContainer) {
    const activeLines = logContainer.querySelectorAll('.device-log-line.is-active');
    for (let i = 0; i < activeLines.length; i++) {
      activeLines[i].classList.remove('is-active');
    }
  }
  line.classList.add('is-active');

  const testId = container.dataset.stepDetail;
  if (testId) {
    selectNearestStepForTime(testId, offsetSeconds);
  }
}

function applyLogVisibility(logInline: HTMLElement): void {
  const searchInput = logInline.querySelector('.device-log-search') as HTMLInputElement | null;
  const term = (searchInput ? searchInput.value : '').toLowerCase();
  const activeFilters: string[] = [];
  const chips = logInline.querySelectorAll('.log-filter-chip');
  for (let c = 0; c < chips.length; c++) {
    const chip = chips[c] as HTMLElement;
    if (chip.classList.contains('is-active') && chip.dataset.logLevel !== 'all') {
      activeFilters.push(chip.dataset.logLevel as string);
    }
  }
  const allChip = logInline.querySelector('.log-filter-chip[data-log-level="all"]');
  const showAll = Boolean(allChip && allChip.classList.contains('is-active'));

  const lines = logInline.querySelectorAll('.device-log-line');
  let visible = 0;
  const total = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as HTMLElement;
    const text = line.textContent || '';
    const matchesSearch = !term || text.toLowerCase().indexOf(term) !== -1;
    const matchesLevel = showAll || activeFilters.indexOf(line.dataset.logLevel as string) !== -1;
    if (matchesSearch && matchesLevel) {
      line.classList.remove('is-hidden');
      visible++;
    } else {
      line.classList.add('is-hidden');
    }
  }

  const countEl = logInline.querySelector('.device-log-match-count');
  if (countEl) {
    countEl.textContent = (term || !showAll) ? visible + ' / ' + total + ' lines' : total + ' lines';
  }
}

function handleLogSearch(input: HTMLElement): void {
  const logInline = input.closest('.device-log-inline') as HTMLElement | null;
  if (logInline) applyLogVisibility(logInline);
}

export function handleLogFilter(chip: HTMLElement): void {
  const logInline = chip.closest('.device-log-inline') as HTMLElement | null;
  if (!logInline) return;
  const level = chip.dataset.logLevel;
  if (level === 'all') {
    const chips = logInline.querySelectorAll('.log-filter-chip');
    for (let i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', (chips[i] as HTMLElement).dataset.logLevel === 'all');
    }
  } else {
    const allChip = logInline.querySelector('.log-filter-chip[data-log-level="all"]');
    chip.classList.toggle('is-active');
    let anyActive = false;
    const levelChips = logInline.querySelectorAll('.log-filter-chip:not([data-log-level="all"])');
    for (let j = 0; j < levelChips.length; j++) {
      if (levelChips[j].classList.contains('is-active')) anyActive = true;
    }
    if (allChip) {
      allChip.classList.toggle('is-active', !anyActive);
    }
  }
  applyLogVisibility(logInline);
}

function handleInputDelegation(e: Event): void {
  const target = e.target as HTMLElement | null;
  if (target && target.classList && target.classList.contains('device-log-search')) {
    handleLogSearch(target);
  }
}

function handleCmdF(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    const activePanel = document.querySelector('[data-test-panel].is-visible');
    const activeLogTab = activePanel
      ? activePanel.querySelector('.tab-content.is-active[data-tab-content="logs"]')
      : null;
    if (activeLogTab) {
      const searchInput = activeLogTab.querySelector('.device-log-search') as HTMLInputElement | null;
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
  }
}

function syncRecordingShell(container: HTMLElement, video: HTMLVideoElement): void {
  const shell = container.querySelector('.recording-shell') as HTMLElement | null;
  if (!shell) {
    return;
  }
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    shell.style.setProperty('--recording-aspect-ratio', String(video.videoWidth) + ' / ' + String(video.videoHeight));
    return;
  }
  shell.style.removeProperty('--recording-aspect-ratio');
}

function ensureRecordingControls(container: HTMLElement): void {
  const video = container.querySelector('[data-role="recording-video"]') as (HTMLVideoElement & { dataset: DOMStringMap }) | null;
  const seekbar = container.querySelector('[data-role="recording-seekbar"]') as HTMLInputElement | null;
  const playPause = container.querySelector('[data-role="recording-playpause"]') as HTMLButtonElement | null;
  const speed = container.querySelector('[data-role="recording-speed"]') as HTMLSelectElement | null;
  if (!video || !seekbar || !playPause || video.dataset.seekbarBound === '1') {
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
    const anyVideo = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
    if (typeof anyVideo.fastSeek === 'function') {
      anyVideo.fastSeek(nextTime);
    } else {
      video.currentTime = nextTime;
    }
    syncControls();
    const testId = container.getAttribute('data-step-detail');
    if (testId) {
      selectNearestStepForTime(testId, nextTime);
    }
    highlightNearestLogLine(container, nextTime);
  };

  const togglePlayback = async () => {
    // When a screenshot is currently shown (cloud path — no per-step video
    // offsets), hitting play swaps the shell over to video mode.
    const screenshot = container.querySelector('[data-role="recording-screenshot"]') as HTMLImageElement | null;
    if (screenshot && screenshot.style.display !== 'none') {
      screenshot.style.display = 'none';
      video.style.display = 'block';
    }
    try {
      if (video.paused || video.ended) {
        await video.play();
      } else {
        video.pause();
      }
    } catch (err) {
      // Browser playback restrictions (autoplay, unsupported codec) —
      // surface so users can see why the video silently refuses to play.
      console.warn('[finalrun-report] video play() failed:', err);
    }
    syncControls();
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

  let lastLogHighlightTime = 0;
  video.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastLogHighlightTime < 500) return;
    lastLogHighlightTime = now;
    highlightNearestLogLine(container, video.currentTime);
  });

  video.dataset.seekbarBound = '1';
}

function updateRecordingControls(container: HTMLElement, video: HTMLVideoElement): void {
  const seekbar = container.querySelector('[data-role="recording-seekbar"]') as HTMLInputElement | null;
  const current = container.querySelector('[data-role="recording-current"]') as HTMLElement | null;
  const duration = container.querySelector('[data-role="recording-duration"]') as HTMLElement | null;
  const playPause = container.querySelector('[data-role="recording-playpause"]') as HTMLButtonElement | null;
  const speed = container.querySelector('[data-role="recording-speed"]') as HTMLSelectElement | null;
  if (!seekbar || !current || !duration || !playPause) {
    return;
  }

  const totalSeconds = Number.isFinite(video.duration) ? Math.max(video.duration, 0) : 0;
  const currentSeconds = Number.isFinite(video.currentTime) ? Math.max(video.currentTime, 0) : 0;
  seekbar.max = String(totalSeconds);
  seekbar.value = String(Math.min(currentSeconds, totalSeconds || currentSeconds));
  seekbar.disabled = totalSeconds <= 0;
  current.textContent = formatVideoClock(currentSeconds);
  duration.textContent = totalSeconds > 0 ? formatVideoClock(totalSeconds) : '--:--';
  playPause.innerHTML = video.paused || video.ended ? PLAY_ICON_SVG : PAUSE_ICON_SVG;
  playPause.setAttribute('aria-label', video.paused || video.ended ? 'Play recording' : 'Pause recording');
  playPause.setAttribute('title', video.paused || video.ended ? 'Play recording' : 'Pause recording');
  if (speed) {
    speed.disabled = !(video.currentSrc || video.src);
  }
}

function syncRecording(container: HTMLElement, test: ReportPayloadTest, step: ReportPayloadStep): void {
  const video = container.querySelector('[data-role="recording-video"]') as HTMLVideoElement | null;
  const screenshot = container.querySelector('[data-role="recording-screenshot"]') as HTMLImageElement | null;
  const empty = container.querySelector('[data-role="empty-recording"]') as HTMLElement | null;
  const controls = container.querySelector('[data-role="recording-controls"]') as HTMLElement | null;

  // Decide which medium drives this step:
  //   a) Video sync when the step has videoOffsetMs AND the test has a recording
  //      (this is the OSS path — agent CLI writes per-step timestamps).
  //   b) Static screenshot when a step has screenshotFile but no video offset
  //      (this is the cloud path — the DB stores screenshots, no timestamps).
  //   c) Otherwise fall back to whatever medium is available; if neither,
  //      show the empty state.
  const hasVideoSync =
    Boolean(test.recordingFile) && step.videoOffsetMs !== undefined && step.videoOffsetMs !== null;
  const hasScreenshot = Boolean(step.screenshotFile);

  if (!test.recordingFile && !hasScreenshot) {
    if (empty) empty.style.display = 'block';
    if (video) video.style.display = 'none';
    if (screenshot) screenshot.style.display = 'none';
    if (controls) controls.style.display = 'none';
    if (video) syncRecordingShell(container, video);
    updateRecordingCaption(container, test);
    return;
  }

  if (empty) empty.style.display = 'none';

  // Screenshot-only path: show the img, hide the video. Keep the control
  // bar visible so the play button remains reachable — pressing it swaps
  // the shell into video mode (see togglePlayback).
  if (!hasVideoSync && hasScreenshot && screenshot) {
    if (video) video.style.display = 'none';
    if (controls) controls.style.display = test.recordingFile ? 'block' : 'none';
    screenshot.style.display = 'block';
    if (step.screenshotFile && screenshot.getAttribute('src') !== step.screenshotFile) {
      screenshot.src = step.screenshotFile;
    }
    // Video element is still in the DOM and we may want to play it later.
    // Initialize controls now so click handlers are bound before the user
    // hits play.
    if (video) ensureRecordingControls(container);
    updateRecordingCaption(container, test, step);
    return;
  }

  // Video path from here on. Make sure controls + video are visible.
  if (!video) return;
  ensureRecordingControls(container);
  if (screenshot) screenshot.style.display = 'none';
  video.style.display = 'block';
  if (controls) controls.style.display = 'block';

  if (step.videoOffsetMs === undefined || step.videoOffsetMs === null) {
    video.pause();
    updateRecordingControls(container, video);
    updateRecordingCaption(container, test, step);
    return;
  }

  const seekSeconds = Math.max(0, step.videoOffsetMs / 1000);
  updateRecordingCaption(container, test, step);

  const applySeek = () => {
    const duration = Number.isFinite(video.duration) ? video.duration : undefined;
    const clampedSeconds =
      duration === undefined
        ? seekSeconds
        : Math.min(seekSeconds, Math.max(duration - 0.05, 0));
    video.pause();
    const anyVideo = video as HTMLVideoElement & { fastSeek?: (t: number) => void };
    if (typeof anyVideo.fastSeek === 'function') {
      anyVideo.fastSeek(clampedSeconds);
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

function updateRecordingCaption(
  container: HTMLElement,
  test: ReportPayloadTest,
  step?: ReportPayloadStep,
  currentSeconds?: number,
): void {
  const label = container.querySelector('[data-role="recording-caption"]') as HTMLElement | null;
  if (!label) {
    return;
  }
  if (!test.recordingFile) {
    label.textContent = 'No session recording was captured for this test.';
    return;
  }
  if (!step) {
    label.textContent = 'No recorded actions are available for this test.';
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

// These SVG strings mirror renderPlayIconSvg() / renderPauseIconSvg() in the
// legacy renderer. Inlined here so updateRecordingControls can swap the icon
// without a DOM reference.
const PLAY_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.5v11l9-5.5-9-5.5z"></path></svg>';
const PAUSE_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6.5h3.5v11H7zm6.5 0H17v11h-3.5z"></path></svg>';
