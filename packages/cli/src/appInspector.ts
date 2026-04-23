// Inspect an Android APK or iOS .app/.ipa/.zip bundle.
// Extracts the minimum metadata we need: platform, package/bundle id,
// and (for iOS) whether the build is simulator-compatible.

import * as fs from 'node:fs';
import AdmZip from 'adm-zip';
import plist from 'simple-plist';

export interface AppMetadata {
  platform: 'android' | 'ios';
  packageName: string;
  simulatorCompatible: boolean; // iOS only — always true for Android
  fileSize: number;
}

export async function inspectApp(filePath: string): Promise<AppMetadata> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`App file not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`App path is not a file: ${filePath}`);
  }
  const fileSize = stats.size;

  const magic = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, magic, 0, magic.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  // All supported formats (APK, IPA, .app.zip) are zip files
  const isZip =
    fileSize >= 4 &&
    magic[0] === 0x50 &&
    magic[1] === 0x4b &&
    magic[2] === 0x03 &&
    magic[3] === 0x04;

  if (!isZip) {
    throw new Error(
      'Not a valid APK or iOS app bundle — expected a zip file (.apk, .ipa, or .zip containing a .app directory).',
    );
  }

  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  // APKs have AndroidManifest.xml at the root
  if (entries.some((e) => e.entryName === 'AndroidManifest.xml')) {
    const packageName = await readApkPackage(filePath);
    return { platform: 'android', packageName, simulatorCompatible: true, fileSize };
  }

  // iOS bundles have some.app/Info.plist (either at root or inside Payload/)
  const plistEntry = entries.find((e) =>
    /(?:^|\/)[^/]+\.app\/Info\.plist$/.test(e.entryName),
  );
  if (plistEntry) {
    const { packageName, simulatorCompatible } = readIosInfo(plistEntry.getData());
    return { platform: 'ios', packageName, simulatorCompatible, fileSize };
  }

  throw new Error(
    'Not a valid APK or iOS app bundle — no AndroidManifest.xml or .app/Info.plist found inside the zip.',
  );
}

async function readApkPackage(filePath: string): Promise<string> {
  // Use ApkParser directly — AppInfoParser's auto-detect checks file extension
  // and we don't rely on that (multer temp files etc. have no extension).
  const ApkParserMod = await import('app-info-parser/src/apk');
  const ApkParser = (ApkParserMod as unknown as { default: new (p: string) => { parse(): Promise<Record<string, unknown>> } }).default
    ?? (ApkParserMod as unknown as new (p: string) => { parse(): Promise<Record<string, unknown>> });
  const result = await new ApkParser(filePath).parse();
  const packageName = (result['package'] as string) || '';
  if (!packageName) {
    throw new Error('APK is missing a package name in AndroidManifest.xml.');
  }
  return packageName;
}

function readIosInfo(plistBuffer: Buffer): { packageName: string; simulatorCompatible: boolean } {
  // simple-plist.parse() handles both XML and binary plists transparently.
  const info = plist.parse(plistBuffer) as Record<string, unknown>;

  const packageName = info['CFBundleIdentifier'] as string | undefined;
  if (!packageName) {
    throw new Error('iOS bundle Info.plist has no CFBundleIdentifier.');
  }
  const platformName = info['DTPlatformName'] as string | undefined;
  // iphoneos = device-only; anything else (iphonesimulator, missing, etc.)
  // we treat as compatible and let simctl install fail later if it isn't.
  const simulatorCompatible = platformName !== 'iphoneos';
  return { packageName, simulatorCompatible };
}

export function formatAppInfo(metadata: AppMetadata): string {
  if (metadata.platform === 'android') {
    return `Detected: Android APK\n  Package:  ${metadata.packageName}`;
  }
  const simNote = metadata.simulatorCompatible ? 'compatible \u2713' : '\u26A0 device-only';
  return `Detected: iOS app bundle\n  Bundle ID:  ${metadata.packageName}\n  Simulator:  ${simNote}`;
}
