import { type SuiteDefinition, type TestDefinition, type RunTarget } from '@finalrun/common';
import { CliEnv } from './env.js';
import {
  resolveAppOverrideIdentifier,
  resolveAppConfig,
  type ResolvedAppConfig,
} from './appConfig.js';
import {
  loadEnvironmentConfig,
  loadTest,
  loadTestSuite,
  validateTestBindings,
} from './testLoader.js';
import { normalizeTestSelectors, selectTestFiles } from './testSelection.js';
import {
  loadWorkspaceConfig,
  resolveWorkspace,
  resolveConfiguredEnvironmentFile,
  resolveSuiteManifestPath,
  validateAppOverride,
  type AppOverrideValidationResult,
  type FinalRunWorkspace,
} from './workspace.js';
import type { LoadedEnvironmentConfig } from './testLoader.js';

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
  tests: TestDefinition[];
  target: RunTarget;
  suite?: SuiteDefinition;
  resolvedApp: ResolvedAppConfig;
  appOverride?: AppOverrideValidationResult;
}

export async function runCheck(
  options: CheckRunnerOptions,
): Promise<CheckRunnerResult> {
  const workspace = await resolveWorkspace(options.cwd);
  const workspaceConfig = await loadWorkspaceConfig(workspace.finalrunDir);
  const resolvedEnvironment = await resolveConfiguredEnvironmentFile(
    workspace,
    options.envName,
  );

  const runtimeEnv = new CliEnv();
  if (resolvedEnvironment.usesEmptyBindings) {
    runtimeEnv.load(undefined, { includeDotEnv: false, cwd: workspace.rootDir });
  } else {
    runtimeEnv.load(resolvedEnvironment.envName, { cwd: workspace.rootDir });
  }

  const environment = await loadEnvironmentConfig(
    resolvedEnvironment.envPath,
    resolvedEnvironment.envName,
    runtimeEnv,
  );
  const resolvedRunTarget = await resolveRunTarget(workspace, options);
  const selectedFiles = await selectTestFiles(
    workspace.testsDir,
    resolvedRunTarget.testSelectors,
    {
      requireSelection:
        resolvedRunTarget.target.type === 'suite'
          ? false
          : options.requireSelection,
    },
  );
  const tests = await Promise.all(
    selectedFiles.map(async (filePath) => {
      const test = await loadTest(filePath, workspace.testsDir);
      validateTestBindings(test, environment.config, {
        environmentResolved: !resolvedEnvironment.usesEmptyBindings,
      });
      return test;
    }),
  );

  const validatedAppOverride = options.appPath
    ? await validateAppOverride(options.appPath, options.platform)
    : undefined;
  const appOverride = validatedAppOverride
    ? {
        ...validatedAppOverride,
        resolvedIdentifier: await resolveAppOverrideIdentifier(validatedAppOverride),
      }
    : undefined;
  const resolvedApp = resolveAppConfig({
    workspaceApp: workspaceConfig.app,
    environmentApp: environment.config.app,
    envName: environment.envName,
    requestedPlatform: options.platform,
    appOverride,
  });

  return {
    workspace,
    environment,
    tests,
    target: resolvedRunTarget.target,
    suite: resolvedRunTarget.suite,
    resolvedApp,
    appOverride,
  };
}

async function resolveRunTarget(
  workspace: FinalRunWorkspace,
  options: CheckRunnerOptions,
): Promise<{
  target: RunTarget;
  testSelectors: string[];
  suite?: SuiteDefinition;
}> {
  const normalizedSelectors = normalizeTestSelectors(options.selectors);
  if (options.suitePath && normalizedSelectors.length > 0) {
    throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
  }

  if (!options.suitePath) {
    return {
      target: { type: 'direct' },
      testSelectors: normalizedSelectors,
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
    testSelectors: suite.tests,
    suite,
  };
}
