import type { DeviceInfo } from './DeviceInfo.js';

export interface CommandTranscript {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type DeviceInventoryDiagnosticScope =
  | 'android-connected'
  | 'android-targets'
  | 'ios-simulators'
  | 'startup';

export interface DeviceInventoryDiagnostic {
  scope: DeviceInventoryDiagnosticScope;
  summary: string;
  blocking: boolean;
  transcripts: CommandTranscript[];
}

export type DeviceInventoryPlatform = 'android' | 'ios';

export type DeviceInventoryTargetKind =
  | 'android-device'
  | 'android-emulator'
  | 'ios-simulator';

export type DeviceInventoryState =
  | 'connected'
  | 'booted'
  | 'shutdown'
  | 'offline'
  | 'unauthorized'
  | 'unavailable';

export interface DeviceInventoryEntry {
  selectionId: string;
  platform: DeviceInventoryPlatform;
  targetKind: DeviceInventoryTargetKind;
  state: DeviceInventoryState;
  stateDetail?: string | null;
  runnable: boolean;
  startable: boolean;
  displayName: string;
  rawId: string;
  modelName: string | null;
  osVersionLabel: string | null;
  deviceInfo: DeviceInfo | null;
  transcripts: CommandTranscript[];
}

export interface DeviceInventoryReport {
  entries: DeviceInventoryEntry[];
  diagnostics: DeviceInventoryDiagnostic[];
}
