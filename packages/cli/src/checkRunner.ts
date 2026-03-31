import { type LoadedRepoTestSuite, type LoadedRepoTestSpec, type RunTargetRecord } from '@finalrun/common';
import { CliEnv } from './env.js';
import {
  loadEnvironmentConfig,
  loadTestSpec,
  loadTestSuite,
  validateSpecBindings,
} from './specLoader.js';
import { normalizeSpecSelectors, selectSpecFiles } from './testSelection.js';
import {
  ensureWorkspaceDirectories,
  resolveWorkspace,
  resolveConfiguredEnvironmentFile,
  resolveSuiteManifestPath,
  validateAppOverride,
  type AppOverrideValidationResult,
  type FinalRunWorkspace,
} from './workspace.js';
import type { LoadedEnvironmentConfig } from './specLoader.js';

export const SUITE_SELECTOR_CONFLICT_ERROR =
  'Pass either --suite <path> or positional test selectors, not both.';

export interface CheckRunnerOptions {
  envName?: string;
  selectors?: string[];
  suitePath?: string;
  platform?: string;
  appPath?: string;
  cwd?: string;
  requireSelection?: boolean;
}

export interface CheckRunnerResult {
  workspace: FinalRunWorkspace;
  environment: LoadedEnvironmentConfig;
  specs: LoadedRepoTestSpec[];
  target: RunTargetRecord;
  suite?: LoadedRepoTestSuite;
  appOverride?: AppOverrideValidationResult;
}

export async function runCheck(
  options: CheckRunnerOptions,
): Promise<CheckRunnerResult> {
  const workspace = await resolveWorkspace(options.cwd);
  await ensureWorkspaceDirectories(workspace);
  const resolvedEnvironment = await resolveConfiguredEnvironmentFile(
    workspace,
    options.envName,
  );

  const runtimeEnv = new CliEnv();
  runtimeEnv.load(undefined, { includeDotEnv: false });

  const environment = await loadEnvironmentConfig(
    resolvedEnvironment.envPath,
    resolvedEnvironment.envName,
    runtimeEnv,
  );
  const resolvedRunTarget = await resolveRunTarget(workspace, options);
  const selectedFiles = await selectSpecFiles(
    workspace.testsDir,
    resolvedRunTarget.specSelectors,
    {
      requireSelection:
        resolvedRunTarget.target.type === 'suite'
          ? false
          : options.requireSelection,
    },
  );
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
    target: resolvedRunTarget.target,
    suite: resolvedRunTarget.suite,
    appOverride,
  };
}

async function resolveRunTarget(
  workspace: FinalRunWorkspace,
  options: CheckRunnerOptions,
): Promise<{
  target: RunTargetRecord;
  specSelectors: string[];
  suite?: LoadedRepoTestSuite;
}> {
  const normalizedSelectors = normalizeSpecSelectors(options.selectors);
  if (options.suitePath && normalizedSelectors.length > 0) {
    throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
  }

  if (!options.suitePath) {
    return {
      target: { type: 'direct' },
      specSelectors: normalizedSelectors,
    };
  }

  const suiteFilePath = await resolveSuiteManifestPath(workspace.suitesDir, options.suitePath);
  const suite = await loadTestSuite(suiteFilePath, workspace.suitesDir);
  return {
    target: {
      type: 'suite',
      suiteId: suite.suiteId,
      suiteName: suite.name,
      suitePath: suite.relativePath,
    },
    specSelectors: suite.tests,
    suite,
  };
}
