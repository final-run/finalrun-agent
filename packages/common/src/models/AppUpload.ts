// Port of common/model/AppUpload.dart (minimal — only fields used by goal-executor)

/**
 * Represents an app upload configuration (used internally for LaunchAppAction).
 *
 * Dart equivalent: common/model/AppUpload.dart
 */
export class AppUpload {
  readonly id: string;
  readonly platform: string;
  readonly packageName: string;

  constructor(params: { id: string; platform: string; packageName: string }) {
    this.id = params.id;
    this.platform = params.platform;
    this.packageName = params.packageName;
  }
}
