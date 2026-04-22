import { loadReportRunManifestViewModel } from '../../../src/artifacts';
import { RunDetailView } from '../../../src/ui/pages/RunDetailView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const manifest = await loadReportRunManifestViewModel(runId);
  return <RunDetailView manifest={manifest} />;
}
