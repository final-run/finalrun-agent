// Public library entry point. Imported from consumers (e.g. finalrun-cloud)
// via `@finalrun/report-web/ui`.
//
// Stable surface:
//   - RunIndexView / RunDetailView — the two page components
//   - Primitive components used internally; exported so consumers can
//     compose their own layouts if needed
//   - Data-model types re-exported from @finalrun/common + artifacts
//
// NOTE: consumers MUST also import the companion stylesheet:
//   import '@finalrun/report-web/ui/styles.css';

export { RunIndexView } from './pages/RunIndexView';
export { RunDetailView } from './pages/RunDetailView';

export { StatusPill } from './components/StatusPill';
export { SummaryCard } from './components/SummaryCard';
export { TintedPngIcon } from './components/TintedPngIcon';
export { DetailSectionCard } from './components/DetailSectionCard';
export { StepButton } from './components/StepButton';
export { VideoPanel } from './components/VideoPanel';
export { DeviceLogPanel } from './components/DeviceLogPanel';
export { RunContextSummary } from './components/RunContextSummary';
export { SegmentSummary } from './components/SegmentSummary';
export { TestDetailSection } from './components/TestDetailSection';

export { buildRunRoute, buildArtifactRoute } from './routes';
export {
  buildTestListItems,
  summarizeTestItems,
  classifyTestStatus,
  deriveReportTitle,
  toReportViewModel,
  formatVideoTimestamp,
  formatRelativeTime,
  statusLabelLong,
} from './viewModel';
export type {
  ReportTestListItem,
  OutcomeSummary,
  TestOutcomeStatus,
} from './viewModel';

export { parseDeviceLogLines, parseLogTimestamp, parseLogLevel } from './logs';
export type { ParsedLogLine } from './logs';

export {
  formatLongDuration,
  formatStepDuration,
  successRateTone,
  statusPillLabel,
  summaryIconStyle,
} from './format';
export type { SummaryTone } from './format';

export {
  initRunDetailController,
  switchTab,
  selectTest,
  clearTestSelection,
  handlePrimaryBack,
  selectStep,
  handleLogFilter,
} from './client/runDetailController';

// Data-model types. Re-exported as types only so consumers can type their
// data adapters. These originate in src/artifacts.ts; the `export type`
// form means tsup strips the import at build time so the library bundle
// stays free of the Node-only artifact-loading code.
export type {
  ReportIndexViewModel,
  ReportIndexRunRecord,
  ReportRunManifest,
  ReportManifestSelectedTestRecord,
  ReportManifestTestRecord,
} from '../artifacts';
