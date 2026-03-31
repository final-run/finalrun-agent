// Port of common/model/DeviceAppInfo.dart

/**
 * Represents an installed app on a device.
 *
 * Dart equivalent: common/model/DeviceAppInfo.dart
 */
export class DeviceAppInfo {
  readonly packageName: string;
  readonly name: string;
  readonly version: string | null;

  constructor(params: {
    packageName: string;
    name: string;
    version?: string | null;
  }) {
    this.packageName = params.packageName;
    this.name = params.name;
    this.version = params.version ?? null;
  }

  static fromJson(json: Record<string, unknown>): DeviceAppInfo {
    return new DeviceAppInfo({
      packageName: json['packageName'] as string,
      name: json['name'] as string,
      version: (json['version'] as string) ?? null,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      packageName: this.packageName,
      name: this.name,
      version: this.version,
    };
  }

  // Dart: static List<String> getAppIdList(List<DeviceAppInfo> apps)
  static getAppIdList(apps: DeviceAppInfo[]): string[] {
    return apps.map((app) => app.packageName);
  }
}
