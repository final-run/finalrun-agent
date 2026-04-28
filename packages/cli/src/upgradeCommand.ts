// `finalrun upgrade` — self-update by re-running the install script.
//
// We don't reimplement the install logic here; the install scripts
// (install.sh on macOS/Linux, install.ps1 on Windows) handle binary
// download, PATH wiring, runtime tarball, and host tools. This subcommand
// just spawns the right one with the same defaults a fresh user would get.
//
// Users who want a binary-only refresh (no runtime tarball, no prompts)
// should run the install script directly with --ci, or set CI=1 /
// FINALRUN_NON_INTERACTIVE=1 — install.sh honors those env vars itself.

import { spawn } from 'node:child_process';

const INSTALL_SH_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh';
const INSTALL_PS1_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.ps1';

export interface UpgradeOptions {
  version?: string;
}

export async function runUpgrade(options: UpgradeOptions): Promise<void> {
  const targetLabel = options.version ? `v${options.version}` : 'latest';
  console.log(`Upgrading finalrun to ${targetLabel}...`);
  console.log('');

  // Strip FINALRUN_* env vars from the inherited environment before spawning
  // the installer. The current process may have been started with debugging
  // overrides (FINALRUN_RUNTIME_ROOT, FINALRUN_ASSET_DIR, FINALRUN_CLOUD_URL,
  // FINALRUN_CACHE_DIR, etc.) — those are runtime concerns for THIS binary
  // and shouldn't influence where the installer puts the next version.
  //
  // The vars that DO mean something to the installer get explicitly carried
  // over: FINALRUN_DIR (install root), FINALRUN_NON_INTERACTIVE (binary-only
  // / no-prompt mode — install.sh and install.ps1 both honor this).
  // FINALRUN_VERSION we set explicitly when --version was passed; otherwise
  // we drop it so the installer resolves "latest".
  const preservedDir = process.env['FINALRUN_DIR'];
  const preservedNonInteractive = process.env['FINALRUN_NON_INTERACTIVE'];
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('FINALRUN_')) {
      env[key] = value;
    }
  }
  if (preservedDir) env['FINALRUN_DIR'] = preservedDir;
  if (preservedNonInteractive) env['FINALRUN_NON_INTERACTIVE'] = preservedNonInteractive;
  if (options.version) env['FINALRUN_VERSION'] = options.version;

  let shell: string;
  let shellArgs: string[];

  if (process.platform === 'win32') {
    shell = 'powershell.exe';
    shellArgs = [
      '-NoProfile',
      '-NoLogo',
      '-Command',
      `irm ${INSTALL_PS1_URL} | iex`,
    ];
  } else {
    // Implemented as `bash -c` so the pipe stays correctly inside one shell.
    shell = 'bash';
    shellArgs = ['-c', `curl -fsSL ${INSTALL_SH_URL} | bash`];
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
