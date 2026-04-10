#!/usr/bin/env node
// CLI entry point — parses arguments and runs the goal.

import { Command } from 'commander';
import { Logger, LogLevel } from '@finalrun/common';
import { formatResolvedAppSummary } from '../src/appConfig.js';
import { CliEnv, MODEL_FORMAT_EXAMPLE, parseModel } from '../src/env.js';
import { resolveApiKey } from '../src/apiKey.js';
import { runCheck, SUITE_SELECTOR_CONFLICT_ERROR } from '../src/checkRunner.js';
import { runDoctorCommand } from '../src/doctorRunner.js';
import {
  buildRunReportUrl,
  buildWorkspaceReportUrl,
  getWorkspaceReportServerStatus,
  openReportUrl,
  resolveHealthyWorkspaceReportServer,
  startOrReuseWorkspaceReportServer,
  stopWorkspaceReportServer,
} from '../src/reportServerManager.js';
import { normalizeTestSelectors, TEST_SELECTION_REQUIRED_ERROR } from '../src/testSelection.js';
import { runCloud } from '../src/cloudRunner.js';
import { PreExecutionFailureError, runTests } from '../src/testRunner.js';
import { formatRunIndexForConsole, loadRunIndex } from '../src/runIndex.js';
import { serveReportWorkspace } from '../src/reportServer.js';
import { initializeCliRuntimeEnvironment, resolveCliPackageVersion } from '../src/runtimePaths.js';
import {
  loadWorkspaceConfig,
  resolveConfiguredEnvironmentFile,
  resolveWorkspace,
  resolveWorkspaceForCommand,
} from '../src/workspace.js';
import { WorkspaceSelectionCancelledError } from '../src/workspacePicker.js';

// ============================================================================
// CLI definition
// ============================================================================

initializeCliRuntimeEnvironment();

const program = new Command()
  .name('finalrun')
  .description('AI-driven mobile app testing from the terminal')
  .version(resolveCliPackageVersion());

program
  .command('check')
  .description('Validate the .finalrun workspace, env config, and test files')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--suite <path>', 'Suite manifest under .finalrun/suites')
  .argument('[selectors...]', 'Optional YAML files, directories, or globs under .finalrun/tests/')
  .action(async (selectors: string[] | undefined, options: CheckCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.INFO, resetSinks: true });
      const normalizedSelectors = normalizeTestSelectors(selectors);
      if (options.suite && normalizedSelectors.length > 0) {
        throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
      }
      const result = await runCheck({
        envName: options.env,
        selectors: normalizedSelectors,
        suitePath: options.suite,
        platform: options.platform,
        appPath: options.app,
      });

      const envSummary =
        result.environment.envName === 'none'
          ? 'using no env bindings.'
          : `using env ${result.environment.envName}.`;
      console.log(formatResolvedAppSummary(result.resolvedApp));
      console.log(
        `Validated ${result.tests.length} test(s) in ${result.workspace.testsDir} ${envSummary}`,
      );
    });
  });

program
  .command('doctor')
  .description('Check mac host readiness for local FinalRun device runs')
  .option('--platform <platform>', 'Target platform (android, ios, or all)')
  .action(async (options: DoctorCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.WARN, resetSinks: true });
      const result = await runDoctorCommand({
        platform: options.platform,
        output: process.stdout,
      });
      if (!result.success) {
        process.exit(1);
      }
    });
  });

program
  .command('runs')
  .description('List local FinalRun reports from the workspace-scoped artifact store')
  .option('--workspace <path>', 'Workspace root or a path inside a FinalRun workspace')
  .option('--json', 'Print the runs index as JSON', false)
  .action(async (options: RunsCommandOptions) => {
    await runCommand(async () => {
      const workspace = await resolveCommandWorkspace(
        options.workspace,
        options.json ? process.stderr : process.stdout,
      );
      const index = await loadRunIndex(workspace.artifactsDir);
      if (options.json) {
        console.log(JSON.stringify(index, null, 2));
        return;
      }
      console.log(formatRunIndexForConsole(index));
      if (index.runs.length > 0) {
        const activeServer = await resolveHealthyWorkspaceReportServer(workspace);
        if (activeServer) {
          console.log(`\nReport server: ${buildWorkspaceReportUrl(activeServer.url)}`);
        } else {
          console.log(
            `\nRun \`finalrun start-server --workspace ${JSON.stringify(workspace.rootDir)}\` to browse reports in the local web UI.`,
          );
        }
      }
    });
  });

program
  .command('test')
  .description('Run repo-local FinalRun YAML tests from .finalrun/tests')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--suite <path>', 'Suite manifest under .finalrun/suites')
  .option('--api-key <key>', 'API key for the LLM provider')
  .option(
    '--model <provider/model>',
    `LLM model in provider/model format (for example ${MODEL_FORMAT_EXAMPLE})`,
  )
  .option('--debug', 'Enable debug logging', false)
  .option('--max-iterations <n>', 'Maximum iterations before giving up', '110')
  .argument(
    '[selectors...]',
    'Workspace-relative YAML files, directories, or globs under .finalrun/tests',
  )
  .action(async (selectors: string[] | undefined, options: TestCommandOptions) => {
    await runTestCommand({
      invokedCommand: 'test',
      selectors,
      options,
    });
  });

program
  .command('suite')
  .description('Run repo-local FinalRun suite manifests from .finalrun/suites')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--api-key <key>', 'API key for the LLM provider')
  .option(
    '--model <provider/model>',
    `LLM model in provider/model format (for example ${MODEL_FORMAT_EXAMPLE})`,
  )
  .option('--debug', 'Enable debug logging', false)
  .option('--max-iterations <n>', 'Maximum iterations before giving up', '110')
  .argument('<suitePath>', 'Workspace-relative YAML file under .finalrun/suites')
  .action(async (suitePath: string, options: TestCommandOptions) => {
    await runTestCommand({
      invokedCommand: 'suite',
      suitePath,
      options,
    });
  });

program
  .command('cloud')
  .description('Run tests on FinalRun cloud devices')
  .option('--env <name>', 'Environment name')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--suite <path>', 'Suite manifest under .finalrun/suites')
  .argument('[selectors...]', 'Workspace-relative YAML files, directories, or globs under .finalrun/tests')
  .action(async (selectors: string[] | undefined, options: CloudCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.INFO, resetSinks: true });
      const normalizedSelectors = normalizeTestSelectors(selectors);
      if (normalizedSelectors.length === 0 && !options.suite) {
        throw new Error(TEST_SELECTION_REQUIRED_ERROR);
      }
      await runCloud({
        selectors: normalizedSelectors,
        suitePath: options.suite,
        envName: options.env,
        platform: options.platform,
        appPath: options.app,
      });
    });
  });

program
  .command('start-server')
  .description('Start or reuse the local FinalRun report server for a workspace')
  .option('--workspace <path>', 'Workspace root or a path inside a FinalRun workspace')
  .option('--port <n>', 'Preferred port to bind to', '4173')
  .option('--dev', 'Run the report server in Next.js development mode', false)
  .action(async (options: StartServerCommandOptions) => {
    await runCommand(async () => {
      await startWorkspaceReportServer({
        workspacePath: options.workspace,
        preferredPort: parsePortOption(options.port, 4173),
        dev: options.dev === true,
      });
    });
  });

program
  .command('stop-server')
  .description('Stop the local FinalRun report server for a workspace')
  .option('--workspace <path>', 'Workspace root or a path inside a FinalRun workspace')
  .action(async (options: WorkspaceCommandOptions) => {
    await runCommand(async () => {
      await stopWorkspaceReportServerCommand(options.workspace);
    });
  });

program
  .command('server-status')
  .description('Show the local FinalRun report server status for a workspace')
  .option('--workspace <path>', 'Workspace root or a path inside a FinalRun workspace')
  .action(async (options: WorkspaceCommandOptions) => {
    await runCommand(async () => {
      await printWorkspaceReportServerStatus(options.workspace);
    });
  });

program
  .command('internal-report-server', { hidden: true })
  .option('--workspace-root <path>', 'Workspace root', '')
  .option('--artifacts-dir <path>', 'Artifacts directory', '')
  .option('--port <n>', 'Port to bind to', '4173')
  .option('--mode <mode>', 'Internal report server mode', 'production')
  .action(async (options: InternalReportServerOptions) => {
    await runCommand(async () => {
      const server = await serveReportWorkspace({
        workspaceRoot: options.workspaceRoot,
        artifactsDir: options.artifactsDir,
        port: parsePortOption(options.port, 4173),
      });

      const shutdown = async (exitCode: number) => {
        try {
          await server.close();
        } catch {
          // ignore shutdown errors for the detached server process
        }
        process.exit(exitCode);
      };

      process.on('SIGINT', () => {
        void shutdown(0);
      });
      process.on('SIGTERM', () => {
        void shutdown(0);
      });
    });
  });

program.parse();

interface CheckCommandOptions {
  env?: string;
  platform?: string;
  app?: string;
  suite?: string;
}

interface CloudCommandOptions {
  env?: string;
  platform?: string;
  app?: string;
  suite?: string;
}

interface DoctorCommandOptions {
  platform?: string;
}

interface TestCommandOptions extends CheckCommandOptions {
  apiKey?: string;
  model?: string;
  debug?: boolean;
  maxIterations: string;
}

interface RunsCommandOptions {
  workspace?: string;
  json?: boolean;
}

interface StartServerCommandOptions {
  workspace?: string;
  port: string;
  dev?: boolean;
}

interface WorkspaceCommandOptions {
  workspace?: string;
}

interface InternalReportServerOptions {
  workspaceRoot: string;
  artifactsDir: string;
  port: string;
  mode: string;
}

async function runTestCommand(params: {
  invokedCommand: 'test' | 'suite';
  selectors?: string[];
  suitePath?: string;
  options: TestCommandOptions;
}): Promise<void> {
  try {
    const normalizedSelectors = normalizeTestSelectors(params.selectors);
    const normalizedSuitePath = params.suitePath?.trim() || params.options.suite;
    if (normalizedSuitePath && normalizedSelectors.length > 0) {
      throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
    }
    if (normalizedSelectors.length === 0 && !normalizedSuitePath) {
      throw new Error(TEST_SELECTION_REQUIRED_ERROR);
    }
    const workspace = await resolveWorkspace();
    const workspaceConfig = await loadWorkspaceConfig(workspace.finalrunDir);
    const model = parseModel(params.options.model ?? workspaceConfig.model);

    const debug = params.options.debug === true;
    Logger.init({ level: debug ? LogLevel.DEBUG : LogLevel.INFO, resetSinks: true });
    const resolvedEnvironment = await resolveConfiguredEnvironmentFile(
      workspace,
      params.options.env,
    );

    const runtimeEnv = new CliEnv();
    runtimeEnv.load(
      resolvedEnvironment.usesEmptyBindings
        ? undefined
        : resolvedEnvironment.envName,
      { cwd: workspace.rootDir },
    );
    const apiKey = resolveApiKey({
      env: runtimeEnv,
      provider: model.provider,
      providedApiKey: params.options.apiKey,
    });

    const result = await runTests({
      envName: resolvedEnvironment.usesEmptyBindings ? undefined : resolvedEnvironment.envName,
      selectors: normalizedSelectors,
      suitePath: normalizedSuitePath,
      platform: params.options.platform,
      appPath: params.options.app,
      apiKey,
      provider: model.provider,
      modelName: model.modelName,
      maxIterations: parseInt(params.options.maxIterations, 10) || 110,
      debug,
      invokedCommand: params.invokedCommand,
    });

    console.log(`Artifacts written to ${result.runDir}`);
    console.log(`Runs index available at ${result.runIndexPath}`);
    try {
      const server = await startOrReuseWorkspaceReportServer({
        workspace,
        requestedPort: 4173,
        dev: false,
      });
      const runUrl = buildRunReportUrl(server.url, result.runId);
      console.log(`Run report available at ${runUrl}`);
      await openUrlBestEffort(runUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Could not start the local report UI automatically: ${message}`);
      console.log('Start the local report UI with `finalrun start-server`.');
    }
    process.exit(result.status === 'aborted' ? 130 : result.success ? 0 : 1);
  } catch (error) {
    if (error instanceof PreExecutionFailureError) {
      await exitWithRawStderr(error.message, error.exitCode);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      await exitWithRawStderr(message, 1);
    }
  }
}

async function runCommand(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof WorkspaceSelectionCancelledError) {
      process.exit(error.exitCode);
    }
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31m✖ Error:\x1b[0m ${msg}\n`);
    process.exit(1);
  }
}

async function startWorkspaceReportServer(params: {
  workspacePath?: string;
  preferredPort: number;
  dev: boolean;
}): Promise<void> {
  const workspace = await resolveCommandWorkspace(params.workspacePath);
  await loadRunIndex(workspace.artifactsDir);
  const server = await startOrReuseWorkspaceReportServer({
    workspace,
    requestedPort: params.preferredPort,
    dev: params.dev,
  });
  const workspaceUrl = buildWorkspaceReportUrl(server.url);
  console.log(`${server.reused ? 'Reusing' : 'Started'} FinalRun report server at ${workspaceUrl}`);
  await openUrlBestEffort(workspaceUrl);
}

async function stopWorkspaceReportServerCommand(workspacePath?: string): Promise<void> {
  const workspace = await resolveCommandWorkspace(workspacePath);
  const result = await stopWorkspaceReportServer(workspace);
  if (!result.stopped) {
    console.log(`FinalRun report server is not running for ${workspace.rootDir}`);
    return;
  }

  console.log(`Stopped FinalRun report server for ${workspace.rootDir}`);
}

async function printWorkspaceReportServerStatus(workspacePath?: string): Promise<void> {
  const workspace = await resolveCommandWorkspace(workspacePath);
  const status = await getWorkspaceReportServerStatus(workspace);
  if (!status.running || !status.state) {
    console.log(`FinalRun report server is not running for ${workspace.rootDir}`);
    return;
  }

  console.log('FinalRun report server status');
  console.log(`Workspace root: ${workspace.rootDir}`);
  console.log(`URL: ${status.state.url}`);
  console.log(`PID: ${status.state.pid}`);
  console.log(`Port: ${status.state.port}`);
  console.log(`Mode: ${status.state.mode}`);
  console.log(`Started at: ${status.state.startedAt}`);
  console.log(`Healthy: ${status.healthy ? 'yes' : 'no'}`);
}

async function resolveCommandWorkspace(
  workspacePath?: string,
  output: NodeJS.WriteStream = process.stdout,
) {
  return resolveWorkspaceForCommand({
    workspacePath,
    io: {
      input: process.stdin,
      output,
      isTTY: Boolean(process.stdin.isTTY && output.isTTY),
    },
  });
}

function parsePortOption(value: string, fallback: number): number {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return fallback;
  }
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid --port value "${value}". Expected an integer between 0 and 65535.`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid --port value "${value}". Expected an integer between 0 and 65535.`);
  }
  return parsed;
}

async function openUrlBestEffort(url: string): Promise<void> {
  try {
    await openReportUrl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not open the browser automatically: ${message}`);
  }
}

async function exitWithRawStderr(message: string, exitCode: number): Promise<never> {
  const rendered = message.endsWith('\n') ? message : `${message}\n`;
  await new Promise<void>((resolve, reject) => {
    process.stderr.write(rendered, (writeError) => {
      if (writeError) {
        reject(writeError);
        return;
      }
      resolve();
    });
  });
  process.exit(exitCode);
}
