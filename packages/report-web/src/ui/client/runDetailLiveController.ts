// Refreshes the controller's cached payload without rebinding listeners or
// resetting the selected step. Pair with initRunDetailController:
//   useEffect(() => initRunDetailController(payload), []);
//   useEffect(() => updateControllerPayload(payload), [data]);

import type { ReportPayload } from './runDetailController';
import { setPayload, refreshLogLineCounts } from './runDetailController';

export function updateControllerPayload(next: ReportPayload): void {
  setPayload(next);
  refreshLogLineCounts();
}
