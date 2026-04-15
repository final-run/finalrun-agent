// Orchestrates multi-device session setup: inventory detect -> auto-assign
// platform-matching devices -> parallel boot + setUp -> return session.
//
// Sibling to sessionRunner.ts — must NOT modify single-device code paths.
// The cleanup() method tears down both devices in parallel with a best-effort
// budget consistent with the 5-second fail-fast ceiling (assumption #16).

import {
  Logger,
  PLATFORM_ANDROID,
  type DeviceInfo,
  type DeviceInventoryEntry,
  type MultiDeviceConfig,
} from '@finalrun/common';
import type { DeviceNode } from '@finalrun/device-node';
import { CliFilePathUtil } from './filePathUtil.js';
import {
  DevicePreparationError,
  testSessionDeps,
} from './sessionRunner.js';

type MultiDeviceRunnerDeviceNode = Pick<
  DeviceNode,
  'init' | 'detectInventory' | 'startTarget' | 'setUpDevice' | 'cleanup'
>;

type MultiDeviceRunnerDevice = Awaited<ReturnType<DeviceNode['setUpDevice']>>;

export interface MultiDeviceSessionDeviceEntry {
  /** Device key from `devices.yaml` (e.g., `alice`, `bob`). */
  key: string;
  /** The connected gRPC driver wrapper. */
  device: MultiDeviceRunnerDevice;
  /** Inventory info. */
  deviceInfo: DeviceInfo;
  /** Normalized platform (currently always `android` for v1). */
  platform: string;
  /** App identifier from `devices.yaml` (unused in v1 session prep — app is
   *  assumed already installed and launched by the orchestrator at execution time). */
  app: string;
  /** Human-readable hardware identifier surfaced by the discovery service. */
  hardwareName: string;
}

export interface MultiDeviceTestSession {
  /** Ordered by the order of keys in `devices.yaml`. */
  devices: Map<string, MultiDeviceSessionDeviceEntry>;
  /** Release all driver connections + singleton pool entries. Safe to call twice. */
  cleanup(): Promise<void>;
}

export interface MultiDeviceSessionDeps {
  createFilePathUtil(): CliFilePathUtil;
  getDeviceNode(): MultiDeviceRunnerDeviceNode;
}

/** Wall-clock ceiling for both cleanups in Promise.all (per spec assumption #16: 3s teardown budget). */
const CLEANUP_TEARDOWN_BUDGET_MS = 3000;

export const multiDeviceSessionDeps: MultiDeviceSessionDeps = {
  createFilePathUtil: () => testSessionDeps.createFilePathUtil(),
  getDeviceNode: () => testSessionDeps.getDeviceNode(),
};

/**
 * Prepare a multi-device test session.
 *
 * Behavior:
 * 1. Detect inventory via `DeviceNode.detectInventory(adbPath)`.
 * 2. Auto-assign: walk `deviceConfig.devices` in key-order; pick the first
 *    unassigned detected device whose platform matches the device entry's
 *    `platform`. Hard-fail if assignment runs out of detected devices.
 * 3. Start any assigned but not-yet-runnable emulators in parallel, then
 *    re-detect to pick up the `runnable` DeviceInfo.
 * 4. `Promise.all` over `setUpDevice()` for both, yielding two independent
 *    driver wrappers. The underlying `DeviceNode` singleton supports concurrent
 *    `setUpDevice()` for distinct device IDs (see T012a spike findings).
 * 5. Return `MultiDeviceTestSession` with a `cleanup()` that closes both
 *    driver connections in parallel.
 */
export async function prepareMultiDeviceTestSession(
  deviceConfig: MultiDeviceConfig,
  dependencies: MultiDeviceSessionDeps = multiDeviceSessionDeps,
): Promise<MultiDeviceTestSession> {
  const configuredKeys = Object.keys(deviceConfig.devices);
  if (configuredKeys.length !== 2) {
    throw new Error(
      `Multi-device session requires exactly 2 devices; got ${configuredKeys.length}`,
    );
  }

  // v1 is Android-only; loader already enforces this, but re-check as a safety net.
  for (const key of configuredKeys) {
    const platform = deviceConfig.devices[key]!.platform;
    if (platform !== PLATFORM_ANDROID) {
      throw new Error(
        `Multi-device v1 supports Android only; device '${key}' requests platform '${platform}'`,
      );
    }
  }

  const filePathUtil = dependencies.createFilePathUtil();
  Logger.i('Detecting devices for multi-device session...');
  const adbPath = await filePathUtil.getADBPath();
  const deviceNode = dependencies.getDeviceNode();
  deviceNode.init(filePathUtil);

  let cleanedUp = false;
  const devices = new Map<string, MultiDeviceSessionDeviceEntry>();

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    // Bounded cleanup — don't block forever if a driver is wedged.
    await Promise.race([
      deviceNode.cleanup(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          Logger.w(
            `Multi-device cleanup exceeded ${CLEANUP_TEARDOWN_BUDGET_MS}ms teardown budget; proceeding`,
          );
          resolve();
        }, CLEANUP_TEARDOWN_BUDGET_MS),
      ),
    ]);
  };

  try {
    let inventory = await deviceNode.detectInventory(adbPath);

    // Auto-assignment state: sets holding inventory selection IDs already
    // claimed, so we never double-assign one emulator to two device keys.
    const claimedSelectionIds = new Set<string>();
    const assignments: Array<{
      key: string;
      platform: string;
      app: string;
      entry: DeviceInventoryEntry;
    }> = [];

    for (const key of configuredKeys) {
      const platform = deviceConfig.devices[key]!.platform;
      const app = deviceConfig.devices[key]!.app;
      const entry = pickDeviceForPlatform(inventory.entries, platform, claimedSelectionIds);
      if (!entry) {
        throw new DevicePreparationError(
          `Multi-device session: not enough ${platform} devices detected to satisfy '${key}'. ` +
            `Connect at least 2 ${platform} devices (or 2 startable emulators) before running.`,
          inventory.diagnostics,
        );
      }
      claimedSelectionIds.add(entry.selectionId);
      assignments.push({ key, platform, app, entry });
    }

    // Start any assigned emulators that are startable-but-not-runnable in parallel.
    const toStart = assignments.filter(({ entry }) => entry.startable && !entry.runnable);
    if (toStart.length > 0) {
      Logger.i(
        `Starting ${toStart.length} emulator(s): ${toStart
          .map(({ entry }) => entry.displayName)
          .join(', ')}`,
      );
      const startResults = await Promise.all(
        toStart.map(({ entry }) => deviceNode.startTarget(entry, adbPath)),
      );
      const startupDiagnostics = startResults.filter(
        (diagnostic): diagnostic is NonNullable<typeof diagnostic> => diagnostic !== null,
      );
      if (startupDiagnostics.length > 0) {
        throw new DevicePreparationError(
          `Failed to start one or more emulators: ${startupDiagnostics
            .map((d) => d.summary)
            .join('; ')}`,
          startupDiagnostics,
        );
      }
      // Re-detect to pick up runnable DeviceInfo for the started emulators.
      inventory = await deviceNode.detectInventory(adbPath);
    }

    // Resolve DeviceInfo for each assignment from the (possibly re-detected) inventory.
    const resolvedAssignments = assignments.map(({ key, platform, app, entry }) => {
      const refreshed =
        inventory.entries.find((e) => e.selectionId === entry.selectionId) ?? entry;
      if (!refreshed.deviceInfo || !refreshed.runnable) {
        throw new DevicePreparationError(
          `Multi-device session: device '${key}' (${refreshed.displayName}) did not become runnable after startup.`,
          inventory.diagnostics,
        );
      }
      return {
        key,
        platform,
        app,
        deviceInfo: refreshed.deviceInfo,
        hardwareName: refreshed.displayName,
      };
    });

    // Parallel setUp — T012a spike confirmed DeviceNode/GrpcDriverSetup/AdbClient
    // serialize port allocation via a mutex and create fresh gRPC clients per call,
    // so this is safe for two distinct device IDs.
    Logger.i('Setting up devices in parallel...');
    const setupResults = await Promise.all(
      resolvedAssignments.map(async (assignment) => {
        const device = await deviceNode.setUpDevice(assignment.deviceInfo);
        return { ...assignment, device };
      }),
    );

    for (const result of setupResults) {
      devices.set(result.key, {
        key: result.key,
        device: result.device,
        deviceInfo: result.deviceInfo,
        platform: result.platform,
        app: result.app,
        hardwareName: result.hardwareName,
      });
      Logger.i(`Device '${result.key}' ready on ${result.hardwareName}`);
    }

    return { devices, cleanup };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      Logger.w(
        'Failed to clean up multi-device session after setup failure:',
        cleanupError,
      );
    }
    throw error;
  }
}

/**
 * Pick the first inventory entry matching `platform` that is not already
 * claimed. Preference order: runnable (already booted) > startable (emulator
 * image present but not booted). Non-runnable, non-startable entries are
 * skipped.
 */
function pickDeviceForPlatform(
  entries: DeviceInventoryEntry[],
  platform: string,
  claimedSelectionIds: Set<string>,
): DeviceInventoryEntry | null {
  const platformMatches = entries.filter(
    (entry) =>
      !claimedSelectionIds.has(entry.selectionId) &&
      entryMatchesPlatform(entry, platform),
  );
  const runnable = platformMatches.find((e) => e.runnable);
  if (runnable) {
    return runnable;
  }
  const startable = platformMatches.find((e) => e.startable);
  if (startable) {
    return startable;
  }
  return null;
}

function entryMatchesPlatform(
  entry: DeviceInventoryEntry,
  platform: string,
): boolean {
  if (platform === PLATFORM_ANDROID) {
    return entry.deviceInfo?.isAndroid === true || entry.platform === PLATFORM_ANDROID;
  }
  return entry.platform === platform;
}
