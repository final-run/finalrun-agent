// `finalrun upgrade` — self-update by re-running the install script.
//
// We don't reimplement the install logic here; the script at
// scripts/install.sh handles binary download, PATH wiring, and
// (interactively) the runtime tarball + host tools. This subcommand
// just spawns it.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveCliPackageVersion } from './runtimePaths.js';

const INSTALL_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh';

export interface UpgradeOptions {
  version?: string;
  cloudOnly?: boolean;
  fullSetup?: boolean;
}

export async function runUpgrade(options: UpgradeOptions): Promise<void> {
  if (options.cloudOnly && options.fullSetup) {
    throw new Error('Pass either --cloud-only or --full-setup, not both.');
  }

  // If the user didn't pick a mode, infer from the current install state:
  // a runtime tarball at ~/.finalrun/runtime/<currentVersion>/ means the
  // user previously ran the full setup, so default to that.
  let effectiveMode: 'cloud-only' | 'full-setup' | 'auto' = 'auto';
  if (options.cloudOnly) {
    effectiveMode = 'cloud-only';
  } else if (options.fullSetup) {
    effectiveMode = 'full-setup';
  } else if (hasInstalledRuntime()) {
    effectiveMode = 'full-setup';
  }

  const targetLabel = options.version ? `v${options.version}` : 'latest';
  console.log(`Upgrading finalrun to ${targetLabel} (mode: ${effectiveMode})...`);
  console.log('');

  // Strip FINALRUN_* env vars from the inherited environment before spawning
  // the installer. The current process may have been started with debugging
  // overrides (FINALRUN_RUNTIME_ROOT, FINALRUN_ASSET_DIR, FINALRUN_CLOUD_URL,
  // FINALRUN_CACHE_DIR, etc.) — those are runtime concerns for THIS binary
  // and shouldn't influence where the installer puts the next version.
  // FINALRUN_DIR is the one knob users intentionally pin install location
  // with, so we preserve it. FINALRUN_VERSION we set explicitly when --version
  // was passed; otherwise we drop it so the installer resolves "latest".
  const preservedDir = process.env['FINALRUN_DIR'];
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('FINALRUN_')) {
      env[key] = value;
    }
  }
  if (preservedDir) env['FINALRUN_DIR'] = preservedDir;
  if (options.version) env['FINALRUN_VERSION'] = options.version;

  const flags: string[] = [];
  if (effectiveMode === 'cloud-only') flags.push('--cloud-only');
  if (effectiveMode === 'full-setup') flags.push('--full-setup');

  // curl -fsSL <url> | bash -s -- <flags>
  // Implemented as `bash -c` so the pipe stays correctly inside one shell.
  const flagPart = flags.length > 0 ? ` -s -- ${flags.join(' ')}` : '';
  const command = `curl -fsSL ${INSTALL_URL} | bash${flagPart}`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn('bash', ['-c', command], {
      stdio: 'inherit',
      env,
    });
    child.on('error', (e) => reject(e));
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Installer terminated by signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Installer exited with code ${code}`));
    });
  });
}

function hasInstalledRuntime(): boolean {
  const version = resolveCliPackageVersion();
  const explicit = process.env['FINALRUN_RUNTIME_ROOT']?.trim();
  if (explicit) {
    return fs.existsSync(path.join(explicit, 'manifest.json'));
  }
  const finalrunDir = process.env['FINALRUN_DIR']?.trim() || path.join(os.homedir(), '.finalrun');
  return fs.existsSync(path.join(finalrunDir, 'runtime', version, 'manifest.json'));
}
