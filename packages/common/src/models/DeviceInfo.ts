// Port of common/model/DeviceInfo.dart
// Only the fields used by the CLI / goal-executor

import { PLATFORM_ANDROID, PLATFORM_IOS, PLATFORM_WEB } from '../constants.js';

/**
 * Information about a connected device (Android or iOS).
 *
 * Dart equivalent: common/model/DeviceInfo.dart
 */
export class DeviceInfo {
  // Dart: String? id — the device serial (e.g. ADB serial or UDID)
  readonly id: string | null;

  // Dart: String deviceUUID — unique identifier
  readonly deviceUUID: string;

  // Dart: bool isAndroid
  readonly isAndroid: boolean;

  // Dart: int sdkVersion
  readonly sdkVersion: number;

  readonly platform: string | null;

  // Dart: String? name
  readonly name: string | null;

  constructor(params: {
    id: string | null;
    deviceUUID: string;
    isAndroid: boolean;
    sdkVersion: number;
    name?: string | null;
    platform?: string | null;
  }) {
    this.id = params.id;
    this.deviceUUID = params.deviceUUID;
    this.isAndroid = params.isAndroid;
    this.sdkVersion = params.sdkVersion;
    this.name = params.name ?? null;
    this.platform = params.platform ?? null;
  }

  // Dart: String getPlatform()
  getPlatform(): string {
    if (this.platform === PLATFORM_ANDROID || this.platform === PLATFORM_IOS || this.platform === PLATFORM_WEB) {
      return this.platform;
    }
    return this.isAndroid ? PLATFORM_ANDROID : PLATFORM_IOS;
  }

  // Dart: factory DeviceInfo.fromJson(Map<String, dynamic> json)
  static fromJson(json: Record<string, unknown>): DeviceInfo {
    return new DeviceInfo({
      id: (json['id'] as string) ?? null,
      deviceUUID: json['deviceUUID'] as string,
      isAndroid: json['isAndroid'] as boolean,
      sdkVersion: json['sdkVersion'] as number,
      name: (json['name'] as string) ?? null,
      platform: (json['platform'] as string) ?? null,
    });
  }

  toJson(): Record<string, unknown> {
    return {
      id: this.id,
      deviceUUID: this.deviceUUID,
      isAndroid: this.isAndroid,
      sdkVersion: this.sdkVersion,
      name: this.name,
      platform: this.platform,
    };
  }
}
