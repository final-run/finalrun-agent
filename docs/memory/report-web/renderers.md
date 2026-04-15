# Renderers (report-web)

`renderers.ts` (`packages/report-web/src/renderers.ts`) generates HTML for the test report viewer. `artifacts.ts` handles manifest loading and artifact resolution.

## Device Log Viewer

### View Model Transformation

`toTestViewModel()` transforms `deviceLogFile` using `buildRunScopedArtifactPath(runId, test.deviceLogFile)` to produce the full artifact route for the download link.

### Inline Collapsible Section

When `deviceLogFile` is present on a test, the renderer outputs:

```html
<details class="device-log">
  <summary>Device log (tail)</summary>
  <pre>{last ~200 lines, HTML-escaped}</pre>
  <a href="{deviceLogRoute}" download>Download full log</a>
</details>
```

This block is positioned after the recording video section. When `deviceLogFile` is undefined, nothing is rendered.

### Server-Side Tail Read

The tail read happens in `artifacts.ts` during manifest loading via `readDeviceLogTail()`:
- Reads the full device log file via `readRunArtifactText()`
- Splits on `\n` and takes `slice(-200)` (last 200 lines)
- Result stored as `deviceLogTailText` on `ReportManifestTestRecord`
- The `<pre>` content is HTML-escaped via `escapeHtml()` in the renderer

### Schema Version

`loadRunManifestRecord()` in `artifacts.ts` accepts schema versions `2` and `3`. Version 2 manifests load without error; device log fields are simply `undefined`.

### CLI Report Template

`reportTemplate.ts` (`packages/cli/src/reportTemplate.ts`) renders the same `<details class="device-log">` block next to the `<video>` tag, using `escapeHtml` for log content.

## Multi-Device Sandwich Workspace

Introduced by change `260415-1mzp-multi-device-orchestration`. `renderTestDetailSection()` branches at entry on `manifest.multiDevice`:

- Absent → existing single-device rendering path, untouched (byte-identical output).
- Present → `renderMultiDeviceWorkspace()` emits a 3-column sandwich layout.

Existing renderers (`renderStepButton`, `renderDeviceLogLines`, the single-device workspace grid) are NEVER modified.

### Layout

`renderSandwichGrid()` emits a CSS grid with `grid-template-columns: 200px minmax(0,1fr) 200px; gap: 12px; align-items: start`. Three cells:

- **Left** — `renderDeviceColumn('alice', 'left')`: header dot `#7F77DD`, device name, platform label; `<video data-device="alice" data-role="recording-video">` with `aspect-ratio: 9/19; border-radius: 14px`.
- **Centre** — `renderStepTimelinePanel(steps)`: `min-height: 380px`, primary background, secondary border, radius-md, padding `10px 8px`. One chat bubble per step via `renderChatBubbleStep()`.
- **Right** — `renderDeviceColumn('bob', 'right')`: mirrored, dot `#1D9E75`, `justify-content: flex-end`.

### Chat Bubble Rendering

`renderChatBubbleStep(step)`:

- **alice step** — left-aligned, background `#EEEDFE`, left border `2px solid #7F77DD`, label `alice · <timestamp>` color `#534AB7`, text color `#26215C`.
- **bob step** — right-aligned, background `#E1F5EE`, right border `2px solid #1D9E75`, label `<timestamp> · bob` color `#0F6E56`, text color `#04342C`.
- **parallel step** — full-width, dashed-border centered bubble, label `<timestamp> · alice + bob · parallel`.
- **selected step** — `box-shadow: 0 0 0 2px #AFA9EC` (alice) or bob equivalent tint.

**Sparse-slot treatment**: For a sequential step acting only on alice, bob's column renders a **1px-tall dimmed spacer** at that iteration's row. This preserves vertical alignment with scrubber segments without emitting a full empty bubble.

### Synced Scrubber

`renderSyncedScrubber(steps, devices)`:

- Label `synced timeline — scrub both devices`.
- Track: `height: 20px; background: secondary; border-radius: 4px`.
- Per step-device pair, an absolute-positioned segment at `left = (step.startMs / totalMs) * 100%`, width proportional, `height: 5px; top: 4px`. Color `#7F77DD` (alice), `#1D9E75` (bob), or `linear-gradient(90deg, #7F77DD, #1D9E75)` (parallel).
- Playhead: 1px absolute bar that updates via a `timeupdate` listener on the first `<video>`.

### Synced Playback Controls

Three JS functions added to the inline report-web script block, all scoped by `data-test-id` containers carrying the multi-device branch (single-device containers never invoke them):

- `selectStep(testId, stepIndex, perDeviceOffsets)` — seeks each device's `<video>` to `perDeviceOffsets[device] / 1000` seconds; toggles `.selected` on the bubble.
- `togglePlayPause(testId)` — if any tracked `<video>` is playing, pauses all; otherwise plays all (autoplay rejections swallowed).
- `onTimelineClick(testId, event)` — computes clicked ratio across scrubber, seeks all tracked `<video>` elements.

### Artifacts Loader Branch

`artifacts.ts` branches on `multiDevice`: absent → existing log-loading path (byte-identical); present → load per-device log tails keyed by device. `toTestViewModel()` maps `perDeviceArtifacts` into per-device video and log URLs only when `multiDevice` is present.

### Shared-Scrubber Anchor

Per-step `videoOffsetMs` is computed per device at write time by the CLI report writer: `max(0, stepTimestamp - deviceRecordingStartedAt)`. The report's shared scrubber anchors t=0 at `min(alice.recordingStartedAt, bob.recordingStartedAt)`, read from the run manifest's `multiDevice.devices` entries.

## Design Decisions (from change 260415-1mzp)

- **Render branch on `manifest.multiDevice` at entry** — keeps the existing single-device path completely unmodified. No runtime check fires on single-device renders.
- **Sandwich over side-by-side** — chat bubbles in a shared middle column make cross-device causality readable at a glance; side-by-side videos with a timeline below are harder to correlate.
- **Sparse 1px spacer, not empty bubble** — preserves vertical alignment between scrubber segments and bubbles for sequential steps without adding visual clutter.
- **New renderers scoped by `data-test-id`** — prevents accidental single-device container interaction by the new JS functions.
