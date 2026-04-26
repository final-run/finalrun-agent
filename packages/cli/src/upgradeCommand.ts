// `finalrun upgrade` — self-update by re-running the install script.
//
// We don't reimplement the install logic here; the install scripts
// (install.sh on macOS/Linux, install.ps1 on Windows) handle binary
// download, PATH wiring, and (interactively) the runtime tarball +
// host tools. This subcommand just spawns the right one.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveCliPackageVersion } from './runtimePaths.js';

const INSTALL_SH_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh';
const INSTALL_PS1_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.ps1';

export interface UpgradeOptions {
  version?: string;
  /** Pass --ci to the installer (binary only, skip runtime tarball + prompts). */
  ci?: boolean;
}

export async function runUpgrade(options: UpgradeOptions): Promise<void> {
  // Mode detection: if the user explicitly passed --ci, honor it. Otherwise,
  // mirror the user's previous install footprint — if they don't have the
  // runtime tarball installed today, they probably want a binary-only
  // upgrade too. If they DO have the runtime tarball, we want the installer
  // to refresh it (default, no --ci flag).
  let useCiFlag = options.ci === true;
  if (!useCiFlag && !hasInstalledRuntime()) {
    useCiFlag = true;
  }

  const targetLabel = options.version ? `v${options.version}` : 'latest';
  const modeLabel = useCiFlag ? 'binary-only (--ci)' : 'full setup';
  console.log(`Upgrading finalrun to ${targetLabel} (${modeLabel})...`);
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

  let shell: string;
  let shellArgs: string[];

  if (process.platform === 'win32') {
    // PowerShell's `irm | iex` reads the script as an in-memory string and
    // can't forward arguments to it (no equivalent of bash's `-s --`). The
    // CI flag travels via env var instead — install.ps1 honors FINALRUN_-
    // NON_INTERACTIVE the same way install.sh does.
    if (useCiFlag) env['FINALRUN_NON_INTERACTIVE'] = '1';
    shell = 'powershell.exe';
    shellArgs = [
      '-NoProfile',
      '-NoLogo',
      '-Command',
      `irm ${INSTALL_PS1_URL} | iex`,
    ];
  } else {
    // curl -fsSL <url> | bash [-s -- --ci]
    // Implemented as `bash -c` so the pipe stays correctly inside one shell.
    const flagPart = useCiFlag ? ' -s -- --ci' : '';
    shell = 'bash';
    shellArgs = ['-c', `curl -fsSL ${INSTALL_SH_URL} | bash${flagPart}`];
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(shell, shellArgs, {
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
