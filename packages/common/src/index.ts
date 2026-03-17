// Barrel export for @finalrun/common

// Interfaces
export type { Agent } from './interfaces/Agent.js';
export type { FilePathUtil } from './interfaces/FilePathUtil.js';

// Models
export { DeviceInfo } from './models/DeviceInfo.js';
export { DeviceActionRequest } from './models/DeviceActionRequest.js';
export { DeviceNodeResponse } from './models/DeviceNodeResponse.js';
export { DeviceAppInfo } from './models/DeviceAppInfo.js';
export type {
  RepoEnvironmentConfig,
  RepoVariableValue,
  RuntimeBindings,
  SecretReference,
} from './models/RepoEnvironment.js';
export type { RepoTestSpec, LoadedRepoTestSpec } from './models/RepoTestSpec.js';
export type {
  PlannerThoughtRecord,
  ActionPayloadRecord,
  StepArtifactRecord,
  SpecArtifactRecord,
  RunSummaryRecord,
} from './models/RunArtifacts.js';
export { Hierarchy, HierarchyNode } from './models/Hierarchy.js';
export {
  Point,
  StepAction,
  TapAction,
  LongPressAction,
  EnterTextAction,
  ScrollAbsAction,
  BackAction,
  HomeAction,
  HideKeyboardAction,
  PressKeyAction,
  LaunchAppAction,
  DeeplinkAction,
  SetLocationAction,
  WaitAction,
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
