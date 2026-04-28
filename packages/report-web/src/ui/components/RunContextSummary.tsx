import type { ReportRunManifest } from '../../artifacts';

// Mirrors renderRunContextSummary() — a grid of 4 (label, value) cards.
export function RunContextSummary({ manifest }: { manifest: ReportRunManifest }) {
  return (
    <div className="run-context-summary">
      <ContextItem label="Environment" value={manifest.input.environment.envName} />
      <ContextItem label="Platform" value={manifest.run.platform} />
      <ContextItem label="Model" value={manifest.run.model.label} />
      <ContextItem label="App" value={manifest.run.app.label} />
    </div>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="context-summary-item">
      <span className="context-summary-label">{label}</span>
      <div className="context-summary-value">{value}</div>
    </div>
  );
}
