// Type-only barrel consumed by src/ui/index.ts and re-exported from
// @finalrun/report-web/ui. The runtime loaders and HTTP-streaming logic
// live in packages/cli/src/reportViewModel.ts + reportArtifactStream.ts —
// this package ships as a browser-facing UI library and must stay free of
// Node built-ins.
//
// Keep these shapes in lockstep with packages/cli/src/reportViewModel.ts.
import type {
  RunIndexEntry,
  RunManifest,
  TestDefinition,
  TestResult,
} from '@finalrun/common';
import type { StatusPillStatus } from './ui/format';

// Widen status to include in-progress states that live-update consumers
// need to display (queued / running / booting / setting_up). The underlying
// common type only covers terminal outcomes.
export interface ReportIndexRunRecord extends Omit<RunIndexEntry, 'status'> {
  status: StatusPillStatus;
  displayName: string;
  displayKind: 'suite' | 'single_test' | 'multi_test' | 'fallback';
  triggeredFrom: 'Suite' | 'Direct';
  selectedTestCount: number;
}

export interface ReportIndexViewModel {
  generatedAt: string;
  summary: {
    totalRuns: number;
    totalSuccessRate: number;
    totalDurationMs: number;
  };
  runs: ReportIndexRunRecord[];
}

export interface ReportManifestSelectedTestRecord extends TestDefinition {
  snapshotYamlText?: string;
}

export interface ReportManifestTestRecord extends TestResult {
  snapshotYamlText?: string;
  deviceLogTailText?: string;
}

export interface ReportRunManifest extends Omit<RunManifest, 'input' | 'tests'> {
  input: Omit<RunManifest['input'], 'tests'> & {
    tests: ReportManifestSelectedTestRecord[];
  };
  tests: ReportManifestTestRecord[];
}
