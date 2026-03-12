// Port of device_node/lib/device/DevicePool.dart

import { Device } from './Device.js';

/**
 * Simple pool of available Device instances.
 * Dart equivalent: DevicePool in device_node/lib/device/DevicePool.dart
 */
export class DevicePool {
  private _devices: Map<string, Device> = new Map();

  /** Add a device to the pool. */
  add(device: Device): void {
    this._devices.set(device.getId(), device);
  }

  /** Remove a device from the pool. */
  remove(deviceId: string): void {
    this._devices.delete(deviceId);
  }

  /** Get a device by ID. */
  get(deviceId: string): Device | undefined {
    return this._devices.get(deviceId);
  }

  /** Get the first available device (or undefined). */
  getFirst(): Device | undefined {
    const first = this._devices.values().next();
    return first.done ? undefined : first.value;
  }

  /** Get all devices. */
  getAll(): Device[] {
    return Array.from(this._devices.values());
  }

  /** Get the number of devices in the pool. */
  get size(): number {
    return this._devices.size;
  }

  /** Check if pool is empty. */
  get isEmpty(): boolean {
    return this._devices.size === 0;
  }
}
