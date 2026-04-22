// Mirrors the <div class="video-panel"> block in the legacy renderTestDetailSection().
// The controller (runDetailController.ts) wires video events, seekbar, play/pause,
// and playback speed via data-role selectors on mount. This component just emits
// the DOM and initial values — no React state for playback, to match the legacy
// behavior exactly.

import { PLAY_ICON_SVG } from '../icons';
import { formatVideoTimestamp } from '../viewModel';

export function VideoPanel({
  testId,
  recordingFile,
  initialVideoOffsetMs,
  initialScreenshotFile,
}: {
  testId: string;
  recordingFile: string | undefined;
  initialVideoOffsetMs: number | undefined;
  initialScreenshotFile?: string | undefined;
}) {
  const recordingSpeedId = `recording-speed-${testId}`;
  const initialSeekValue =
    initialVideoOffsetMs !== undefined
      ? String(Math.max(0, initialVideoOffsetMs / 1000))
      : '0';

  // If there's no per-step videoOffsetMs but the step carries a static
  // screenshot (common in cloud where the DB has screenshots but no
  // per-step video timestamps), render the screenshot on top of the video
  // element and start in screenshot mode. The play button switches the
  // media shell back to video mode.
  const showScreenshotInitially =
    initialVideoOffsetMs === undefined && Boolean(initialScreenshotFile);

  return (
    <div className="video-panel">
      <div className="media-shell recording-shell">
        {recordingFile ? (
          <video
            data-role="recording-video"
            playsInline
            preload="metadata"
            src={recordingFile}
            style={showScreenshotInitially ? { display: 'none' } : undefined}
          />
        ) : null}
        {initialScreenshotFile ? (
          <img
            data-role="recording-screenshot"
            src={initialScreenshotFile}
            alt=""
            style={showScreenshotInitially ? undefined : { display: 'none' }}
          />
        ) : null}
        {!recordingFile && !initialScreenshotFile ? (
          <div className="empty-shot" data-role="empty-recording">
            No session recording was captured for this test.
          </div>
        ) : null}
        {recordingFile ? (
          <div
            className="empty-shot"
            data-role="empty-recording"
            style={{ display: 'none' }}
          >
            No session recording was captured for this test.
          </div>
        ) : null}
      </div>
      <div
        className="recording-controls"
        data-role="recording-controls"
        style={{ display: recordingFile ? 'block' : 'none' }}
      >
        <div className="recording-control-row">
          <button
            className="recording-icon-button primary"
            data-role="recording-playpause"
            type="button"
            aria-label="Play recording"
            title="Play recording"
            dangerouslySetInnerHTML={{ __html: PLAY_ICON_SVG }}
          />
          <span className="recording-time" data-role="recording-current">
            {formatVideoTimestamp(initialVideoOffsetMs)}
          </span>
          <input
            className="recording-timeline"
            data-role="recording-seekbar"
            type="range"
            min="0"
            max="0"
            step="0.1"
            defaultValue={initialSeekValue}
            aria-label="Seek recording timeline"
          />
          <span className="recording-time" data-role="recording-duration">
            --:--
          </span>
          <label className="visually-hidden" htmlFor={recordingSpeedId}>
            Playback speed
          </label>
          <select
            className="recording-speed"
            data-role="recording-speed"
            id={recordingSpeedId}
            aria-label="Playback speed"
            defaultValue="2"
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
          </select>
        </div>
      </div>
    </div>
  );
}
