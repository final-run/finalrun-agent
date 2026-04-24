// Resolver for the "local runtime" — the heavyweight modules (test runner,
// device drivers, doctor, report server) that local commands need but cloud
// commands do not.
//
// Today these modules live alongside the CLI in packages/cli/src/, so the
// resolver simply lazy-imports them. In the binary distribution (Bun-compiled
// finalrun), the heavy npm dependencies they pull in (goal-executor,
// device-node, AI SDKs, gRPC) live in a separate runtime tarball at
// ~/.finalrun/runtime/<version>/node_modules/. The resolver checks for that
// tarball and points the loader at it; if missing, it throws a clear error
// with the user-facing recovery instructions.
//
// Cloud commands never call into this file. They import their dependencies
// directly so they work from a slim install with no runtime tarball.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveCliPackageVersion } from './runtimePaths.js';

const INSTALL_URL =
  'https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh';

export class LocalRuntimeMissingError extends Error {
  readonly exitCode = 1;
  readonly cliVersion: string;
  readonly runtimeRoot: string;

  constructor(cliVersion: string, runtimeRoot: string) {
    super(buildMessage(cliVersion, runtimeRoot));
    this.name = 'LocalRuntimeMissingError';
    this.cliVersion = cliVersion;
    this.runtimeRoot = runtimeRoot;
  }
}

function buildMessage(cliVersion: string, runtimeRoot: string): string {
  return [
    '',
    '\x1b[31m✖ Local runtime not installed.\x1b[0m',
    '',
    '  This command needs the local test runtime (driver bundles, AI SDKs,',
    '  device control, report server). Install it by re-running:',
    '',
    `    curl -fsSL ${INSTALL_URL} | bash -s -- --full-setup`,
    '',
    '  Or run in cloud instead:',
    '',
    '    finalrun cloud test <selectors> --app <path>',
    '',
    `  (Looked for runtime ${cliVersion} at ${runtimeRoot})`,
    '',
  ].join('\n');
}

export interface LocalRuntime {
  testRunner: typeof import('./testRunner.js');
  doctorRunner: typeof import('./doctorRunner.js');
  reportServer: typeof import('./reportServer.js');
  reportServerManager: typeof import('./reportServerManager.js');
}

export function resolveLocalRuntimeRoot(): string {
  const override = process.env['FINALRUN_RUNTIME_ROOT'];
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), '.finalrun', 'runtime', resolveCliPackageVersion());
}

/**
 * Returns true when the CLI is running from a normal `npm install` of the
 * monorepo (dev iteration, current npm distribution). In that mode the
 * heavy modules live in the local node_modules tree and lazy-import works
 * out of the box.
 *
 * Returns false when the CLI is running as a Bun-compiled binary with no
 * local runtime tarball present — that's when LocalRuntimeMissingError
 * should fire.
 *
 * Detection: the CLI was launched from a packages/cli/dist/ tree (or
 * tsx-compiled monorepo source). For now we treat this as the dev/npm path.
 * The Bun binary will be detected via process.versions.bun in phase 4.
 */
function isRunningFromMonorepoOrNpm(): boolean {
  // Bun-compiled binary sets process.versions.bun; npm/Node does not.
  return typeof (process.versions as Record<string, string | undefined>)['bun'] === 'undefined';
}

/**
 * Lazy-load the local-runtime modules. Cloud commands never call this;
 * local commands await it before running their handler.
 *
 * In phase 2 (current): always succeeds because heavy modules ship with
 * the CLI's node_modules. The resolveLocalRuntimeRoot path is computed
 * but not yet used to switch loaders.
 *
 * In phase 4: when running as a Bun binary, the loader will resolve from
 * runtimeRoot/node_modules via createRequire and throw LocalRuntimeMissingError
 * if the tarball is not extracted there.
 */
export async function resolveLocalRuntime(): Promise<LocalRuntime> {
  const runtimeRoot = resolveLocalRuntimeRoot();

  if (!isRunningFromMonorepoOrNpm()) {
    // Bun binary path: require the runtime tarball to be installed.
    if (!fs.existsSync(path.join(runtimeRoot, 'manifest.json'))) {
      throw new LocalRuntimeMissingError(resolveCliPackageVersion(), runtimeRoot);
    }
    // Phase 4 will swap in createRequire(runtimeRoot/node_modules/_stub.js)
    // and load these modules from there. For now this branch is never taken
    // in dev or npm installs.
  }

  const [testRunner, doctorRunner, reportServer, reportServerManager] = await Promise.all([
    import('./testRunner.js'),
    import('./doctorRunner.js'),
    import('./reportServer.js'),
    import('./reportServerManager.js'),
  ]);

  return { testRunner, doctorRunner, reportServer, reportServerManager };
}

/**
 * Heuristic for whether the current process can prompt the user. Used by
 * any code path that wants to ask before doing something heavy (e.g.
 * downloading the runtime tarball). False in CI and any non-TTY context.
 */
export function isInteractive(): boolean {
  if (process.env['CI']) return false;
  if (process.env['FINALRUN_NON_INTERACTIVE']) return false;
  return Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
}
