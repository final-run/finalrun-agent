import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkgVersion: string = (require('../package.json') as { version?: string }).version ?? '0.0.0';

function resolveAssetCacheRoot(): string {
  const override = process.env['FINALRUN_CACHE_DIR'];
  if (override && override.trim()) {
    return path.resolve(override, pkgVersion);
  }
  return path.join(os.homedir(), '.finalrun', 'assets', pkgVersion);
}

export type RuntimeAssetKind =
  | 'android-driver-apk'
  | 'android-driver-test-apk'
  | 'ios-driver-archive'
  | 'ios-driver-runner-archive';

export interface RuntimeAssetManifestRecord {
  version: string;
  assets: RuntimeAssetRecord[];
}

export interface RuntimeAssetRecord {
  kind: RuntimeAssetKind;
  platform: 'android' | 'ios';
  filename: string;
  url: string;
  sha256: string;
  size: number;
  relativePath?: string;
}

interface RuntimeAssetStoreOptions {
  downloadAssets?: boolean;
}

function resolveLocalResourceDir(startDir: string = __dirname): string | undefined {
  const envDir = process.env['FINALRUN_ASSET_DIR'];
  if (envDir && envDir.trim()) {
    return path.resolve(envDir);
  }

  const candidates = [
    path.resolve(startDir, '../../../resources'),
    path.resolve(startDir, '../../../../resources'),
    path.resolve(startDir, '../../resources'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function relativePathForAssetKind(kind: RuntimeAssetKind): string {
  switch (kind) {
    case 'android-driver-apk':
      return path.join('android', 'app-debug.apk');
    case 'android-driver-test-apk':
      return path.join('android', 'app-debug-androidTest.apk');
    case 'ios-driver-archive':
      return path.join('ios', 'finalrun-ios.zip');
    case 'ios-driver-runner-archive':
      return path.join('ios', 'finalrun-ios-test-Runner.zip');
  }
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export class RuntimeAssetStore {
  private readonly _resourceDir: string;
  private readonly _downloadAssets: boolean;
  private _manifestPromise: Promise<RuntimeAssetManifestRecord | undefined> | null = null;

  constructor(resourceDir?: string, options?: RuntimeAssetStoreOptions) {
    this._resourceDir = resourceDir
      ? path.resolve(resourceDir)
      : resolveLocalResourceDir() ?? resolveAssetCacheRoot();
    this._downloadAssets = options?.downloadAssets === true;
  }

  getResourceDir(): string {
    return this._resourceDir;
  }

  async resolveAssetPath(kind: RuntimeAssetKind): Promise<string | null> {
    const directPath = path.join(this._resourceDir, relativePathForAssetKind(kind));
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    if (!this._downloadAssets) {
      return null;
    }

    const manifest = await this._loadManifest();
    const asset = manifest?.assets.find((entry) => entry.kind === kind);
    if (!asset) {
      return null;
    }

    const destinationPath = path.join(
      this._resourceDir,
      asset.relativePath ?? relativePathForAssetKind(kind),
    );
    if (await this._isValidAssetFile(destinationPath, asset)) {
      return destinationPath;
    }

    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    const downloaded = await this._readAssetBytes(asset.url);
    const downloadedHash = sha256Hex(downloaded);
    if (downloaded.length !== asset.size) {
      throw new Error(
        `Downloaded FinalRun asset ${asset.filename} has size ${downloaded.length}, expected ${asset.size}.`,
      );
    }
    if (downloadedHash !== asset.sha256.toLowerCase()) {
      throw new Error(
        `Downloaded FinalRun asset ${asset.filename} failed checksum verification.`,
      );
    }

    const tempPath = `${destinationPath}.download-${process.pid}-${Date.now()}`;
    await fsp.writeFile(tempPath, downloaded);
    await fsp.rename(tempPath, destinationPath);
    return destinationPath;
  }

  private async _loadManifest(): Promise<RuntimeAssetManifestRecord | undefined> {
    if (this._manifestPromise) {
      return await this._manifestPromise;
    }

    this._manifestPromise = (async () => {
      const manifestPath = process.env['FINALRUN_ASSET_MANIFEST_PATH'];
      if (manifestPath && manifestPath.trim()) {
        const raw = await fsp.readFile(path.resolve(manifestPath), 'utf-8');
        return JSON.parse(raw) as RuntimeAssetManifestRecord;
      }

      const localManifestPath = path.join(this._resourceDir, 'assets-manifest.json');
      if (fs.existsSync(localManifestPath)) {
        const raw = await fsp.readFile(localManifestPath, 'utf-8');
        return JSON.parse(raw) as RuntimeAssetManifestRecord;
      }

      const manifestUrl = process.env['FINALRUN_ASSET_MANIFEST_URL'];
      if (manifestUrl && manifestUrl.trim()) {
        const response = await fetch(manifestUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to download the FinalRun asset manifest from ${manifestUrl}: ${response.status} ${response.statusText}`,
          );
        }
        return await response.json() as RuntimeAssetManifestRecord;
      }

      return undefined;
    })();

    return await this._manifestPromise;
  }

  private async _isValidAssetFile(
    filePath: string,
    asset: RuntimeAssetRecord,
  ): Promise<boolean> {
    try {
      const bytes = await fsp.readFile(filePath);
      return bytes.length === asset.size && sha256Hex(bytes) === asset.sha256.toLowerCase();
    } catch {
      return false;
    }
  }

  private async _readAssetBytes(assetUrl: string): Promise<Buffer> {
    if (assetUrl.startsWith('file://')) {
      return await fsp.readFile(fileURLToPath(assetUrl));
    }

    const response = await fetch(assetUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download the FinalRun asset from ${assetUrl}: ${response.status} ${response.statusText}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
