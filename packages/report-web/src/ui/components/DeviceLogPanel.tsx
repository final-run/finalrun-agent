'use client';

import { parseDeviceLogLines } from '../logs';
import { handleLogFilter } from '../client/runDetailController';

// Mirrors the `<div class="device-log-inline">` subtree in the legacy
// renderTestDetailSection(). The controller attaches document-level
// listeners for search input, log-line clicks, and Cmd+F; the chips wire
// their onClick to handleLogFilter(this).
export function DeviceLogPanel({
  logText,
  recordingStartedAt,
  deviceLogFileUrl,
}: {
  logText: string;
  recordingStartedAt: string | undefined;
  deviceLogFileUrl: string;
}) {
  const lines = parseDeviceLogLines(logText, recordingStartedAt);

  return (
    <div className="device-log-inline" data-recording-started={recordingStartedAt ?? ''}>
      <div className="device-log-toolbar">
        <input className="device-log-search" type="text" placeholder="Search logs..." />
        <span className="device-log-match-count"></span>
        <div className="device-log-filters">
          <button
            className="log-filter-chip is-active"
            data-log-level="all"
            onClick={(e) => handleLogFilter(e.currentTarget)}
            type="button"
          >
            All
          </button>
          <button
            className="log-filter-chip"
            data-log-level="error"
            onClick={(e) => handleLogFilter(e.currentTarget)}
            type="button"
          >
            Errors
          </button>
          <button
            className="log-filter-chip"
            data-log-level="warn"
            onClick={(e) => handleLogFilter(e.currentTarget)}
            type="button"
          >
            Warnings
          </button>
        </div>
      </div>
      <div className="device-log-lines">
        {lines.length === 0 ? (
          <div className="device-log-line muted">No log content available.</div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className="device-log-line"
              data-log-ts={line.timestamp ?? ''}
              data-log-level={line.level}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
      <a className="device-log-download" href={deviceLogFileUrl} download>
        Download full log
      </a>
    </div>
  );
}
