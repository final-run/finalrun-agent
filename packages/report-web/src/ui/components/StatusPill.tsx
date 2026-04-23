import { statusPillLabel, type StatusPillStatus } from '../format';

export function StatusPill({ status }: { status: StatusPillStatus }) {
  return <span className={`status-pill ${status}`}>{statusPillLabel(status)}</span>;
}
