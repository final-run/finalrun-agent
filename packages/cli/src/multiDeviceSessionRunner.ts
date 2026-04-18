// Orchestrates: detect devices -> set up 2 devices -> pre-launch apps on both.

import {
  AppUpload,
  DeviceAgent,
  DeviceActionRequest,
  DeviceInfo,
  LaunchAppAction,
  Logger,
  PLATFORM_ANDROID,
  type DeviceInventoryEntry,
  type MultiDeviceTestDevice,
} from '@finalrun/common';
import { DeviceNode } from '@finalrun/device-node';
import { CliFilePathUtil } from './filePathUtil.js';
import {
  printDiagnosticsFailure,
  promptForDeviceSelection,
  type DeviceSelectionIO,
} from './deviceInventoryPresenter.js';
import { DevicePreparationError } from './sessionRunner.js';

export interface MultiDeviceSession {
  devices: Map<string, DeviceAgent>;
  deviceInfos: Map<string, DeviceInfo>;
  /** role → human-friendly device display name (e.g. "Pixel_10") */
  deviceDisplayNames: Map<string, string>;
  platform: string;
  cleanup(): Promise<void>;
}

export interface MultiDeviceSessionConfig {
  deviceRoles: MultiDeviceTestDevice[];
  platform?: string;
  /**
   * Optional APK/app path to install on all devices before launching.
   * Same semantics as single-device --app override.
   */
  appOverridePath?: string;
}

interface MultiDeviceSessionDeps {
  createFilePathUtil(): CliFilePathUtil;
  getDeviceNode(): Pick<
    DeviceNode,
    'init' | 'detectInventory' | 'startTarget' | 'setUpDevice' | 'cleanup' | 'installAndroidApp' | 'installIOSApp'
  >;
  createSelectionIO(): DeviceSelectionIO;
}

const defaultDeps: MultiDeviceSessionDeps = {
  createFilePathUtil: () => new CliFilePathUtil(undefined, undefined, { downloadAssets: true }),
  getDeviceNode: () => DeviceNode.getInstance(),
  createSelectionIO: () => ({
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdin.isTTY === true && process.stdout.isTTY === true,
  }),
};

export async function prepareMultiDeviceSession(
  config: MultiDeviceSessionConfig,
  deps: MultiDeviceSessionDeps = defaultDeps,
): Promise<MultiDeviceSession> {
  const filePathUtil = deps.createFilePathUtil();
  Logger.i('Detecting local devices for multi-device test...');
  const adbPath = await filePathUtil.getADBPath();
  const deviceNode = deps.getDeviceNode();
  const selectionIO = deps.createSelectionIO();
  deviceNode.init(filePathUtil);
  let cleanedUp = false;

  const cleanup = async (): Promise<void> => {
    if (cleanedUp) return;
    cleanedUp = true;
    await deviceNode.cleanup();
  };

  try {
    let inventory = await deviceNode.detectInventory(adbPath);

    // Select a platform that has at least 2 usable (runnable OR startable) entries
    const requestedPlatform = config.platform?.toLowerCase();
    const usableEntries = inventory.entries.filter(
      (e) =>
        (e.runnable || e.startable) &&
        (!requestedPlatform || e.platform === requestedPlatform),
    );

    const byPlatform = new Map<string, DeviceInventoryEntry[]>();
    for (const entry of usableEntries) {
      const plat = entry.platform;
      if (!byPlatform.has(plat)) byPlatform.set(plat, []);
      byPlatform.get(plat)!.push(entry);
    }

    let selectedPlatform: string | undefined;
    let pickedEntries: DeviceInventoryEntry[] = [];

    // Prefer a platform where we already have 2 runnable; otherwise accept startable
    for (const [plat, entries] of byPlatform) {
      const runnable = entries.filter((e) => e.runnable);
      const startable = entries.filter((e) => e.startable && !e.runnable);
      if (runnable.length + startable.length >= 2) {
        selectedPlatform = plat;
        // Prefer runnable first, then startable to fill to 2
        pickedEntries = [...runnable, ...startable].slice(0, 2);
        break;
      }
    }

    if (!selectedPlatform || pickedEntries.length < 2) {
      const availableStr = Array.from(byPlatform.entries())
        .map(
          ([p, e]) =>
            `${p}: ${e.filter((x) => x.runnable).length} runnable, ${e.filter((x) => x.startable && !x.runnable).length} startable`,
        )
        .join('; ');

      if (inventory.diagnostics.length > 0) {
        printDiagnosticsFailure({
          heading: 'Device discovery issues',
          diagnostics: inventory.diagnostics,
          output: selectionIO.output,
        });
      }

      throw new DevicePreparationError(
        `Multi-device tests require at least 2 runnable/startable devices of the same platform. ` +
          `Found: ${availableStr || 'no usable devices'}. ` +
          `Start additional emulators/simulators and try again.`,
      );
    }

    const runnableCount = pickedEntries.filter((e) => e.runnable).length;
    const startableCount = pickedEntries.length - runnableCount;
    Logger.i(
      `Picked 2 ${selectedPlatform} target(s) — ${runnableCount} already running, ${startableCount} to start.`,
    );

    // Start any startable entries, then re-detect to get their deviceInfo
    const needsStart = pickedEntries.filter((e) => !e.runnable && e.startable);
    for (const entry of needsStart) {
      Logger.i(`Starting device: ${entry.displayName}`);
      const startupDiagnostic = await deviceNode.startTarget(entry, adbPath);
      if (startupDiagnostic) {
        printDiagnosticsFailure({
          heading: 'Device startup failed',
          diagnostics: [startupDiagnostic],
          output: selectionIO.output,
        });
        throw new DevicePreparationError(startupDiagnostic.summary, [startupDiagnostic]);
      }
    }

    if (needsStart.length > 0) {
      Logger.i('Waiting for started devices to become runnable...');
      inventory = await deviceNode.detectInventory(adbPath);
      const refreshed: DeviceInventoryEntry[] = [];
      for (const original of pickedEntries) {
        const latest =
          inventory.entries.find(
            (e) => e.selectionId === original.selectionId && e.runnable,
          ) ?? null;
        if (!latest?.deviceInfo) {
          throw new DevicePreparationError(
            `Device "${original.displayName}" did not become runnable after startup.`,
          );
        }
        refreshed.push(latest);
      }
      pickedEntries = refreshed;
    }

    // Assign roles to devices (first role → first entry)
    const roles = config.deviceRoles;
    const deviceAgents = new Map<string, DeviceAgent>();
    const deviceInfos = new Map<string, DeviceInfo>();
    const deviceDisplayNames = new Map<string, string>();

    for (let i = 0; i < roles.length; i++) {
      const role = roles[i]!;
      const entry = pickedEntries[i]!;
      if (!entry?.deviceInfo) {
        throw new DevicePreparationError(
          `No runnable deviceInfo for role "${role.role}".`,
        );
      }
      const info = entry.deviceInfo;
      const displayName = info.name ?? entry.displayName ?? info.id ?? role.role;

      Logger.i(`Setting up device for role "${role.role}": ${entry.displayName}`);
      const agent = await deviceNode.setUpDevice(info);
      Logger.i(`Driver connected for "${role.role}" (${displayName}).`);

      deviceAgents.set(role.role, agent);
      deviceInfos.set(role.role, info);
      deviceDisplayNames.set(role.role, displayName);
    }

    // Install app override on all devices, if provided (mirrors single-device --app behavior)
    if (config.appOverridePath) {
      for (const role of roles) {
        const info = deviceInfos.get(role.role)!;
        if (!info.id) {
          throw new DevicePreparationError(
            `Device serial/id is required to install an app override for role "${role.role}".`,
          );
        }
        Logger.i(`Installing app override on "${role.role}" (${info.name ?? info.id}): ${config.appOverridePath}`);
        if (selectedPlatform === PLATFORM_ANDROID) {
          const installed = await deviceNode.installAndroidApp(
            adbPath!,
            info.id,
            config.appOverridePath,
          );
          if (!installed) {
            throw new DevicePreparationError(
              `Failed to install Android app override on "${role.role}": ${config.appOverridePath}`,
            );
          }
        } else {
          const installed = await deviceNode.installIOSApp(
            info.id,
            config.appOverridePath,
          );
          if (!installed) {
            throw new DevicePreparationError(
              `Failed to install iOS app override on "${role.role}": ${config.appOverridePath}`,
            );
          }
        }
      }
    }

    // Pre-launch apps on both devices. LaunchAppAction itself reports a clear
    // error if the package is not installed, so we skip the separate
    // GetAppList precheck (it can lag on freshly-booted emulators).
    for (const role of roles) {
      const agent = deviceAgents.get(role.role)!;
      const info = deviceInfos.get(role.role)!;

      Logger.i(`Launching "${role.app}" on "${role.role}" (${info.name ?? info.id})...`);
      const launchResponse = await agent.executeAction(
        new DeviceActionRequest({
          requestId: `prelaunch-${role.role}`,
          action: new LaunchAppAction({
            appUpload: new AppUpload({
              id: '',
              platform: selectedPlatform,
              packageName: role.app,
            }),
            allowAllPermissions: true,
            shouldUninstallBeforeLaunch: false,
            clearState: false,
            stopAppBeforeLaunch: false,
          }),
          timeout: 60,
        }),
      );

      if (!launchResponse.success) {
        throw new DevicePreparationError(
          `Failed to launch "${role.app}" on device "${role.role}" (${info.name ?? info.id}): ${launchResponse.message ?? 'unknown error'}. ` +
            `Install the app manually or pass --app <path>.`,
        );
      }
      Logger.i(`App launched on "${role.role}".`);
    }

    return {
      devices: deviceAgents,
      deviceInfos,
      deviceDisplayNames,
      platform: selectedPlatform,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      Logger.w('Failed to clean up device resources after setup failure:', cleanupError);
    }
    throw error;
  }
}
