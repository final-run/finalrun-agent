// Port of common/model/SingleArgument.dart

/**
 * A single key-value argument for app launch.
 *
 * Dart equivalent: common/model/SingleArgument.dart
 */
export class SingleArgument {
  readonly key: string;
  readonly value: string;
  readonly type: string;

  constructor(params: { key: string; value: string; type: string }) {
    this.key = params.key;
    this.value = params.value;
    this.type = params.type;
  }
}
