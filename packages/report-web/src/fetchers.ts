// Fetch helpers for the CLI-hosted SPA. The CLI report server (see
// packages/cli/src/reportServer.ts) exposes matching JSON endpoints.

import type { ReportIndexViewModel, ReportRunManifest } from './artifacts';

export async function fetchReportIndex(): Promise<ReportIndexViewModel> {
  const response = await fetch('/api/report/index', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load report index (${response.status} ${response.statusText})`);
  }
  return (await response.json()) as ReportIndexViewModel;
}

export async function fetchReportRun(runId: string): Promise<ReportRunManifest> {
  const response = await fetch(`/api/report/runs/${encodeURIComponent(runId)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load run ${runId} (${response.status} ${response.statusText})`);
  }
  return (await response.json()) as ReportRunManifest;
}
