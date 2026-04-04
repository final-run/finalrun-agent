export interface AgentActionTrace {
  step: number;
  action: string;
  status: 'success' | 'failure';
  totalMs: number;
  spans: TraceSpan[];
  failureReason?: string;
}

export interface TraceSpan {
  name: string;
  startMs: number;
  durationMs: number;
  status: 'success' | 'failure';
  detail?: string;
}

export interface TimingInfo {
  totalMs: number;
  spans: Array<{
    name: string;
    durationMs: number;
    status: 'success' | 'failure';
    detail?: string;
  }>;
}

export interface SpanTiming {
  name: string;
  durationMs: number;
  status: 'success' | 'failure';
  detail?: string;
}
