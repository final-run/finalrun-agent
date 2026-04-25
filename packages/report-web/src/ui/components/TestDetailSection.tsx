'use client';

import type { ReportRunManifest } from '../../artifacts';
import { formatLongDuration } from '../format';
import { statusLabelLong, type ReportTestListItem } from '../viewModel';
import { StatusPill } from './StatusPill';
import { DetailSectionCard } from './DetailSectionCard';
import { StepButton } from './StepButton';
import { VideoPanel } from './VideoPanel';
import { DeviceLogPanel } from './DeviceLogPanel';
import { RunContextSummary } from './RunContextSummary';
import { switchTab } from '../client/runDetailController';

// Mirrors renderTestDetailSection() + renderTestSpecSection() +
// renderRunContextSection() + renderTestAnalysisSection() all inlined.
export function TestDetailSection({
  item,
  visible,
  parentLabel,
  manifest,
}: {
  item: ReportTestListItem;
  visible: boolean;
  parentLabel?: string;
  manifest?: ReportRunManifest;
}) {
  const detailSubtitle = parentLabel
    ? `${parentLabel} · ${item.input.relativePath ?? ''}`
    : item.input.relativePath ?? '';
  const test = item.executed;
  const initialStep = test?.steps[0];
  const statusText = statusLabelLong(item.status);
  const analysisText = test
    ? test.analysis || test.message || 'No overall analysis recorded.'
    : 'This test was selected for the run, but it never started. The batch ended before this test could execute.';
  const snapshotYamlText = test?.snapshotYamlText ?? item.input.snapshotYamlText;
  const snapshotYamlPath = test?.snapshotYamlPath ?? item.input.snapshotYamlPath;
  const stepCount = test?.steps.length ?? 0;

  return (
    <section
      className={`detail-shell${visible ? ' is-visible' : ''}`}
      data-test-panel={item.input.testId!}
    >
      <div className="detail-header">
        <div className="detail-header-main">
          <div className="detail-header-copy">
            <h2>{item.input.name}</h2>
            <p>{detailSubtitle}</p>
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="detail-meta">
        <MetaCard label="Status" value={statusText} />
        <MetaCard label="Duration" value={test ? formatLongDuration(test.durationMs) : 'NA'} />
        <MetaCard label="Steps" value={`${stepCount} recorded`} />
        <MetaCard label="Path" value={item.input.relativePath ?? ''} />
      </div>

      <TestSpecSection snapshotYamlPath={snapshotYamlPath} snapshotYamlText={snapshotYamlText} />
      {manifest ? (
        <DetailSectionCard
          title="Run Context"
          subtitle="Inputs and environment captured for this report."
          content={<RunContextSummary manifest={manifest} />}
        />
      ) : null}
      <DetailSectionCard
        title="Analysis"
        subtitle="Overall result commentary captured for this test."
        action={<StatusPill status={item.status} />}
        cardClass={`analysis-card ${item.status}`}
        content={<div className="analysis-copy">{analysisText}</div>}
      />

      <div className="workspace" data-step-detail={item.input.testId!}>
        <VideoPanel
          testId={item.input.testId!}
          recordingFile={test?.recordingFile ?? undefined}
          initialVideoOffsetMs={initialStep?.videoOffsetMs ?? undefined}
          initialScreenshotFile={initialStep?.screenshotFile ?? undefined}
        />

        <div className="tabs-panel">
          <div className="tab-bar">
            <button
              className="tab-button is-active"
              data-tab="actions"
              onClick={(e) => switchTab(e.currentTarget)}
              type="button"
            >
              Actions
            </button>
            {test?.deviceLogFile ? (
              <button
                className="tab-button"
                data-tab="logs"
                onClick={(e) => switchTab(e.currentTarget)}
                type="button"
              >
                Device Logs
              </button>
            ) : null}
          </div>

          <div className="tab-content is-active" data-tab-content="actions">
            <div className="timeline-scroll">
              {test && test.steps.length > 0 ? (
                test.steps.map((step, index) => (
                  <StepButton key={index} testId={test.testId} step={step} index={index} />
                ))
              ) : (
                <div className="empty-panel">No steps were recorded for this test.</div>
              )}
            </div>
          </div>

          {test?.deviceLogFile ? (
            <div className="tab-content" data-tab-content="logs">
              <DeviceLogPanel
                logText={test.deviceLogTailText ?? ''}
                recordingStartedAt={test.recordingStartedAt ?? undefined}
                deviceLogFileUrl={test.deviceLogFile}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TestSpecSection({
  snapshotYamlPath,
  snapshotYamlText,
}: {
  snapshotYamlPath: string | undefined;
  snapshotYamlText: string | undefined;
}) {
  const content = snapshotYamlText ? (
    <div className="yaml-shell">
      <pre className="yaml-block">
        <code>{snapshotYamlText}</code>
      </pre>
    </div>
  ) : (
    <div className="empty-panel">Snapshot YAML was not available for this report.</div>
  );
  const action = snapshotYamlPath ? (
    <a className="detail-section-link" href={snapshotYamlPath}>
      Open raw YAML
    </a>
  ) : undefined;
  return (
    <DetailSectionCard
      title="Test"
      subtitle="Captured YAML snapshot for this test."
      action={action}
      content={content}
    />
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-meta-card">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}
