// Port of common/model/App.dart (minimal — only fields used by goal-executor)

/**
 * Represents an app entity (used internally for LaunchAppAction).
 *
 * Dart equivalent: common/model/App.dart
 */
export class App {
  readonly id: string;
  readonly name: string;

  constructor(params: { id: string; name: string }) {
    this.id = params.id;
    this.name = params.name;
  }
}
