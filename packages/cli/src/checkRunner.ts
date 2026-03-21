import { CliEnv } from './env.js';
import { loadEnvironmentConfig, loadTestSpec, validateSpecBindings } from './specLoader.js';
import { selectSpecFiles } from './testSelection.js';
import {
  ensureWorkspaceDirectories,
  resolveWorkspace,
  resolveEnvironmentFile,
  validateAppOverride,
  type AppOverrideValidationResult,
  type FinalRunWorkspace,
} from './workspace.js';
import type { LoadedEnvironmentConfig } from './specLoader.js';
import type { LoadedRepoTestSpec } from '@finalrun/common';

export interface CheckRunnerOptions {
  envName?: string;
  selectors?: string[];
  platform?: string;
  appPath?: string;
  cwd?: string;
  requireSelection?: boolean;
}

export interface CheckRunnerResult {
  workspace: FinalRunWorkspace;
  environment: LoadedEnvironmentConfig;
  specs: LoadedRepoTestSpec[];
  appOverride?: AppOverrideValidationResult;
}

export async function runCheck(
  options: CheckRunnerOptions,
): Promise<CheckRunnerResult> {
  const workspace = await resolveWorkspace(options.cwd);
  await ensureWorkspaceDirectories(workspace);
  const resolvedEnvironment = await resolveEnvironmentFile(
    workspace.envDir,
    options.envName,
  );

  const runtimeEnv = new CliEnv();
  runtimeEnv.load(undefined, { includeDotEnv: false });

  const environment = await loadEnvironmentConfig(
    resolvedEnvironment.envPath,
    resolvedEnvironment.envName,
    runtimeEnv,
  );
  const selectedFiles = await selectSpecFiles(workspace.testsDir, options.selectors, {
    requireSelection: options.requireSelection,
  });
  const specs = await Promise.all(
    selectedFiles.map(async (filePath) => {
      const spec = await loadTestSpec(filePath, workspace.testsDir);
      validateSpecBindings(spec, environment.config, {
        environmentResolved: !resolvedEnvironment.usesEmptyBindings,
      });
      return spec;
    }),
  );

  const appOverride = options.appPath
    ? await validateAppOverride(options.appPath, options.platform)
    : undefined;

  return {
    workspace,
    environment,
    specs,
    appOverride,
  };
}
