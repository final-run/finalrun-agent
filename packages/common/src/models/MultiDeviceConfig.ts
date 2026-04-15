/**
 * Types for multi-device test workspaces (v1: 2 Devices, Same Platform).
 *
 * Parallels `EnvironmentConfig` / `TestDefinition` types for the single-device
 * workspace. A multi-device workspace lives under `.finalrun/multi-device/` and
 * declares exactly 2 devices in `devices.yaml`.
 */

/** Single device entry in `devices.yaml`. */
export interface DeviceDefinition {
  /** Platform identifier — v1 accepts only `"android"`. */
  platform: string;
  /** App identifier (packageName for Android, bundleId for iOS). */
  app: string;
}

/**
 * Parsed `.finalrun/multi-device/devices.yaml`.
 *
 * Loader-enforced invariants (see `multiDeviceTestLoader.ts`):
 *   (a) exactly 2 entries;
 *   (b) all entries share the same `platform`;
 *   (c) v1 rejects any `platform !== 'android'`;
 *   (d) keys are unique and match `[A-Za-z0-9_-]+`.
 */
export interface MultiDeviceConfig {
  /** Map of device key (e.g. `"alice"`, `"bob"`) to its definition. */
  devices: Record<string, DeviceDefinition>;
}
