import * as net from 'node:net';
import { DEFAULT_GRPC_PORT_START, Logger } from '@finalrun/common';

/**
 * Per-device port pool for gRPC driver connections.
 *
 * Each device (Android emulator serial, iOS simulator UDID, etc.) gets a
 * unique port from a configured range. The same allocator instance is
 * intended to be shared across platforms inside one device-node process so
 * an Android driver and an iOS driver running on the same host can't both
 * try to use the same loopback port.
 *
 * Behavior is modelled on AdbClient's earlier in-class pool: bindability is
 * probed with `net.createServer().listen()` so the kernel rejects ports
 * already squatted on by an unrelated process, and allocate/release are
 * serialized with an async mutex so two concurrent calls can't both reserve
 * the same port between the probe and the bookkeeping write.
 */
export class GrpcPortAllocator {
  private readonly _rangeStart: number;
  private readonly _rangeEnd: number;
  private readonly _portMap: Map<string, number> = new Map();
  private readonly _allocatedPorts: Set<number> = new Set();
  private _lock: Promise<void> = Promise.resolve();
  private readonly _isPortBindableFn: (port: number) => Promise<boolean>;

  constructor(params?: {
    rangeStart?: number;
    rangeEnd?: number;
    isPortBindable?: (port: number) => Promise<boolean>;
  }) {
    this._rangeStart = params?.rangeStart ?? DEFAULT_GRPC_PORT_START;
    this._rangeEnd = params?.rangeEnd ?? this._rangeStart + 100;
    this._isPortBindableFn = params?.isPortBindable ?? defaultIsPortBindable;
  }

  /**
   * Reserve a port for `key` (typically a device serial / UDID). Idempotent —
   * a key that already holds a port gets the same one back.
   */
  async allocate(key: string): Promise<number> {
    return this._withLock(async () => {
      const existing = this._portMap.get(key);
      if (existing !== undefined) {
        return existing;
      }

      for (let port = this._rangeStart; port < this._rangeEnd; port++) {
        if (this._allocatedPorts.has(port)) continue;
        if (!(await this._isPortBindableFn(port))) continue;

        this._allocatedPorts.add(port);
        this._portMap.set(key, port);
        Logger.d(`Allocated gRPC port ${port} for ${key}`);
        return port;
      }

      throw new Error(
        `No gRPC ports available in range ${this._rangeStart}-${this._rangeEnd} for ${key}`,
      );
    });
  }

  /** Return the current port reservation for `key`, if any. */
  getPort(key: string): number | undefined {
    return this._portMap.get(key);
  }

  /** Free `key`'s port back to the pool. No-op if `key` holds nothing. */
  async release(key: string): Promise<void> {
    await this._withLock(async () => {
      const port = this._portMap.get(key);
      if (port === undefined) return;
      this._portMap.delete(key);
      this._allocatedPorts.delete(port);
      Logger.d(`Released gRPC port ${port} for ${key}`);
    });
  }

  /** Drop all reservations. Used after an external state-wipe (e.g. adb forward --remove-all). */
  async clear(): Promise<void> {
    await this._withLock(async () => {
      this._portMap.clear();
      this._allocatedPorts.clear();
    });
  }

  private async _withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this._lock;
    let releaseLock!: () => void;
    this._lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    try {
      await previous;
      return await fn();
    } finally {
      releaseLock();
    }
  }
}

function defaultIsPortBindable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}
