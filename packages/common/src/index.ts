// Barrel export for @finalrun/common

// Interfaces
export type { Agent } from './interfaces/Agent.js';
export type { FilePathUtil } from './interfaces/FilePathUtil.js';

// Models
export { DeviceInfo } from './models/DeviceInfo.js';
export type {
  CommandTranscript,
  DeviceInventoryDiagnostic,
  DeviceInventoryDiagnosticScope,
  DeviceInventoryEntry,
  DeviceInventoryPlatform,
  DeviceInventoryReport,
  DeviceInventoryState,
  DeviceInventoryTargetKind,
} from './models/DeviceInventory.js';
export { DeviceActionRequest } from './models/DeviceActionRequest.js';
export { DeviceNodeResponse } from './models/DeviceNodeResponse.js';
export { DeviceAppInfo } from './models/DeviceAppInfo.js';
export { RecordingRequest } from './models/RecordingRequest.js';
export type {
  RepoEnvironmentConfig,
  RepoVariableValue,
  RuntimeBindings,
  SecretReference,
} from './models/RepoEnvironment.js';
export type { RepoTestSpec, LoadedRepoTestSpec } from './models/RepoTestSpec.js';
export type { RepoTestSuite, LoadedRepoTestSuite } from './models/RepoTestSuite.js';
export type {
  PlannerThoughtRecord,
  ActionPayloadRecord,
  FailurePhase,
  BindingReferenceRecord,
  ReportServerStateRecord,
  RunTargetRecord,
  StepArtifactRecord,
  SpecArtifactRecord,
  RunSummaryRecord,
  RunManifestAuthoredRefRecord,
  RunManifestFirstFailureRecord,
  RunManifestStepRecord,
  RunManifestSpecRecord,
  RunManifestEnvironmentRecord,
  RunManifestSelectedSpecRecord,
  RunManifestSuiteRecord,
  RunManifestCliRecord,
  RunManifestModelRecord,
  RunManifestAppRecord,
  RunManifestCountRecord,
  RunManifestRecord,
  RunIndexEntryRecord,
  RunIndexRecord,
} from './models/RunArtifacts.js';
export { Hierarchy, HierarchyNode } from './models/Hierarchy.js';
export {
  Point,
  PointPercent,
  StepAction,
  TapAction,
  TapPercentAction,
  LongPressAction,
  EnterTextAction,
  EraseTextAction,
  ScrollAbsAction,
  BackAction,
  HomeAction,
  RotateAction,
  HideKeyboardAction,
  PressKeyAction,
  LaunchAppAction,
  DeeplinkAction,
  SetLocationAction,
  WaitAction,
  GetScreenshotAction,
  GetHierarchyAction,
  GetScreenshotAndHierarchyAction,
  GetAppListAction,
  KillAppAction,
  SwitchToPrimaryAppAction,
  CheckAppInForegroundAction,
} from './models/TestStep.js';
export { App } from './models/App.js';
export { AppUpload } from './models/AppUpload.js';
export { SingleArgument } from './models/SingleArgument.js';

// Constants
export * from './constants.js';

// Logger
export type { LogEntry, LoggerSink } from './logger.js';
export { Logger, LogLevel } from './logger.js';

// Repo runner helpers
export {
  resolveRuntimePlaceholders,
  containsSecretPlaceholder,
  redactResolvedValue,
} from './repoPlaceholders.js';
