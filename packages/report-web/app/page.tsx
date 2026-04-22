// Server Component. Loads the run-index view model from disk and hands it to
// the client-rendered RunIndexView.

import { loadReportIndexViewModel } from '../src/artifacts';
import { RunIndexView } from '../src/ui/pages/RunIndexView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const index = await loadReportIndexViewModel();
  return <RunIndexView index={index} />;
}
