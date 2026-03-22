// Port of device_node/lib/device_node.dart
// Singleton entry point for device management.

import type { FilePathUtil, DeviceInfo } from '@finalrun/common';
import { Logger } from '@finalrun/common';
import { DeviceDiscoveryService } from './discovery/DeviceDiscoveryService.js';
import { DevicePool } from './device/DevicePool.js';
import { Device } from './device/Device.js';
import { GrpcDriverSetup } from './grpc/GrpcDriverSetup.js';
import { AdbClient } from './infra/android/AdbClient.js';
import { SimctlClient } from './infra/ios/SimctlClient.js';

/**
 * Singleton manager for detecting, tracking, and providing access to connected devices.
 *
 * Dart equivalent: DeviceNode in device_node/lib/device_node.dart
 */
export class DeviceNode {
  private static _instance: DeviceNode | null = null;

  private _deviceDiscoveryService: DeviceDiscoveryService;
  private _devicePool: DevicePool;
  private _grpcDriverSetup: GrpcDriverSetup | null = null;
  private _initialized: boolean = false;
  private _adbClient: AdbClient;
  private _simctlClient: SimctlClient;

  private constructor() {
    this._deviceDiscoveryService = new DeviceDiscoveryService();
    this._devicePool = new DevicePool();
    this._adbClient = new AdbClient();
    this._simctlClient = new SimctlClient();
  }

  /** Get the singleton instance. */
  static getInstance(): DeviceNode {
    if (!DeviceNode._instance) {
      DeviceNode._instance = new DeviceNode();
    }
    return DeviceNode._instance;
  }

  /** Reset the singleton (for testing). */
  static resetInstance(): void {
    DeviceNode._instance = null;
  }

  /**
   * Initialize the device node with a file path utility.
   * Must be called before any other method.
   */
  init(filePathUtil: FilePathUtil): void {
    this._grpcDriverSetup = new GrpcDriverSetup({
      adbClient: this._adbClient,
      simctlClient: this._simctlClient,
      filePathUtil,
    });
    this._initialized = true;
  }

  /**
   * Detect all connected devices (Android + iOS).
   * Dart: Future<List<DeviceInfo>> detectDevices()
   */
  async detectDevices(adbPath: string | null): Promise<DeviceInfo[]> {
    const devices: DeviceInfo[] = [];

    if (adbPath) {
      const androidDevices = await this._deviceDiscoveryService.getAndroidDevices(adbPath);
      devices.push(...androidDevices);
    }

    const iosDevices = await this._deviceDiscoveryService.getIOSDevices();
    devices.push(...iosDevices);

    Logger.i(`Detected ${devices.length} device(s)`);
    return devices;
  }

  /**
   * Set up a device for execution: install driver, connect gRPC, add to pool.
   * Returns the fully set up Device instance.
   */
  async setUpDevice(deviceInfo: DeviceInfo): Promise<Device> {
    if (!this._initialized || !this._grpcDriverSetup) {
      throw new Error('DeviceNode not initialized. Call init() first.');
    }

    const device = await this._grpcDriverSetup.setUp(deviceInfo);
    this._devicePool.add(device);
    return device;
  }

  /**
   * Get the first available device from the pool.
   */
  getFirstDevice(): Device | undefined {
    return this._devicePool.getFirst();
  }

  /**
   * Get a specific device by ID.
   */
  getDevice(deviceId: string): Device | undefined {
    return this._devicePool.get(deviceId);
  }

  /**
   * Clean up — close all device connections.
   */
  async cleanup(): Promise<void> {
    for (const device of this._devicePool.getAll()) {
      try {
        await device.closeConnection();
      } catch {
        // ignore cleanup errors
      }
    }
  }

  async installAndroidApp(
    adbPath: string,
    deviceId: string,
    appPath: string,
  ): Promise<boolean> {
    return await this._adbClient.installApp(adbPath, deviceId, appPath);
  }

  async installIOSApp(deviceId: string, appPath: string): Promise<boolean> {
    return await this._simctlClient.installApp(deviceId, appPath);
  }
}
