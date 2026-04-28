import { statusPillLabel } from '../format';

type StatusPillStatus = 'success' | 'failure' | 'error' | 'aborted' | 'not_executed';

export function StatusPill({ status }: { status: StatusPillStatus }) {
  return <span className={`status-pill ${status}`}>{statusPillLabel(status)}</span>;
}
