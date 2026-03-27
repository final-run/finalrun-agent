#!/usr/bin/env node
// Port of mobile_cli/bin/mobile_cli.dart
// CLI entry point — parses arguments and runs the goal.

import * as path from 'node:path';
import { Command } from 'commander';
import { Logger, LogLevel } from '@finalrun/common';
import { CliEnv, parseModel } from '../src/env.js';
import { resolveApiKey } from '../src/apiKey.js';
import { runCheck, SUITE_SELECTOR_CONFLICT_ERROR } from '../src/checkRunner.js';
import { runDoctorCommand } from '../src/doctorRunner.js';
import {
  buildRunReportUrl,
  buildWorkspaceReportUrl,
  openReportUrl,
  resolveHealthyWorkspaceReportServer,
  startOrReuseWorkspaceReportServer,
} from '../src/reportServerManager.js';
import {
  normalizeSpecSelectors,
  TEST_SELECTION_REQUIRED_ERROR,
} from '../src/testSelection.js';
import { runTests } from '../src/testRunner.js';
import { formatRunIndexForConsole, loadRunIndex } from '../src/runIndex.js';
import {
  ensureWorkspaceDirectories,
  resolveEnvironmentFile,
  resolveWorkspace,
} from '../src/workspace.js';

// ============================================================================
// CLI definition
// ============================================================================

const program = new Command()
  .name('finalrun')
  .description('AI-driven mobile app testing from the terminal')
  .version('1.0.0');

program
  .command('check')
  .description('Validate the .finalrun workspace, env config, and test specs')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--suite <path>', 'Suite manifest under .finalrun/suites')
  .argument('[selectors...]', 'Optional YAML files, directories, or globs under .finalrun/tests/')
  .action(async (selectors: string[] | undefined, options: CheckCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.INFO, resetSinks: true });
      const resolvedEnvironment = await resolveCliEnvironment(options.env);
      const normalizedSelectors = normalizeSpecSelectors(selectors);
      if (options.suite && normalizedSelectors.length > 0) {
        throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
      }
      const result = await runCheck({
        envName: resolvedEnvironment.usesEmptyBindings
          ? undefined
          : resolvedEnvironment.envName,
        selectors: normalizedSelectors,
        suitePath: options.suite,
        platform: options.platform,
        appPath: options.app,
      });

      const envSummary = result.environment.envName === 'none'
        ? 'using no env bindings.'
        : `using env ${result.environment.envName}.`;
      console.log(`Validated ${result.specs.length} spec(s) in ${result.workspace.testsDir} ${envSummary}`);
    });
  });

program
  .command('doctor')
  .description('Check mac host readiness for local FinalRun device runs')
  .option('--platform <platform>', 'Target platform (android, ios, or all)')
  .action(async (options: DoctorCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.INFO, resetSinks: true });
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
  .description('List local FinalRun reports from .finalrun/artifacts')
  .option('--json', 'Print the runs index as JSON', false)
  .action(async (options: RunsCommandOptions) => {
    await runCommand(async () => {
      const workspace = await resolveWorkspace();
      await ensureWorkspaceDirectories(workspace);
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
          console.log('\nRun `finalrun start-server` to browse reports in the local web UI.');
        }
      }
    });
  });

program
  .command('test')
  .description('Run repo-local FinalRun YAML specs')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
  .option('--suite <path>', 'Suite manifest under .finalrun/suites')
  .option('--api-key <key>', 'API key for the LLM provider')
  .option(
    '--model <provider/model>',
    'LLM model in provider/model format (for example openai/gpt-4o)',
    'openai/gpt-4o',
  )
  .option('--debug', 'Enable debug logging', false)
  .option('--max-iterations <n>', 'Maximum iterations before giving up', '50')
  .argument('[selectors...]', 'YAML files, directories, or globs under .finalrun/tests')
  .action(async (selectors: string[] | undefined, options: TestCommandOptions) => {
    await runCommand(async () => {
      const normalizedSelectors = normalizeSpecSelectors(selectors);
      if (options.suite && normalizedSelectors.length > 0) {
        throw new Error(SUITE_SELECTOR_CONFLICT_ERROR);
      }
      if (normalizedSelectors.length === 0 && !options.suite) {
        throw new Error(TEST_SELECTION_REQUIRED_ERROR);
      }

      const debug = options.debug === true;
      Logger.init({ level: debug ? LogLevel.DEBUG : LogLevel.INFO, resetSinks: true });
      const resolvedEnvironment = await resolveCliEnvironment(options.env);

      const runtimeEnv = new CliEnv();
      runtimeEnv.load(
        resolvedEnvironment.usesEmptyBindings
          ? undefined
          : resolvedEnvironment.envName,
      );
      const model = parseModel(options.model);
      const apiKey = resolveApiKey({
        env: runtimeEnv,
        provider: model.provider,
        providedApiKey: options.apiKey,
      });

      const result = await runTests({
        envName: resolvedEnvironment.usesEmptyBindings
          ? undefined
          : resolvedEnvironment.envName,
        selectors: normalizedSelectors,
        suitePath: options.suite,
        platform: options.platform,
        appPath: options.app,
        apiKey,
        provider: model.provider,
        modelName: model.modelName,
        maxIterations: parseInt(options.maxIterations, 10) || 50,
        debug,
      });

      console.log(`Artifacts written to ${result.runDir}`);
      console.log(`Runs index available at ${result.runIndexPath}`);
      const workspace = await resolveWorkspace();
      const activeServer = await resolveHealthyWorkspaceReportServer(workspace);
      if (activeServer) {
        const runUrl = buildRunReportUrl(activeServer.url, result.runId);
        console.log(`Run report available at ${runUrl}`);
        await openUrlBestEffort(runUrl);
      } else {
        console.log('Start the local report UI with `finalrun start-server`.');
      }
      process.exit(result.success ? 0 : 1);
    });
  });

program
  .command('start-server')
  .description('Start or reuse the local FinalRun report server for this workspace')
  .option('--port <n>', 'Preferred port to bind to', '4173')
  .option('--dev', 'Run the report server in Next.js development mode', false)
  .action(async (options: StartServerCommandOptions) => {
    await runCommand(async () => {
      await startWorkspaceReportServer({
        preferredPort: parseInt(options.port, 10) || 4173,
        dev: options.dev === true,
      });
    });
  });

const reportCommand = program
  .command('report')
  .description('Report helpers for local FinalRun artifacts');

reportCommand
  .command('serve')
  .description('Compatibility alias for `finalrun start-server`')
  .option('--port <n>', 'Port to bind to', '4173')
  .option('--dev', 'Run the report server in Next.js development mode', false)
  .action(async (options: ReportServeCommandOptions) => {
    await runCommand(async () => {
      await startWorkspaceReportServer({
        preferredPort: parseInt(options.port, 10) || 4173,
        dev: options.dev === true,
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

interface DoctorCommandOptions {
  platform?: string;
}

interface TestCommandOptions extends CheckCommandOptions {
  apiKey?: string;
  model: string;
  debug?: boolean;
  maxIterations: string;
}

interface RunsCommandOptions {
  json?: boolean;
}

interface ReportServeCommandOptions {
  port: string;
  dev?: boolean;
}

interface StartServerCommandOptions {
  port: string;
  dev?: boolean;
}

async function runCommand(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31m✖ Error:\x1b[0m ${msg}\n`);
    process.exit(1);
  }
}

async function resolveCliEnvironment(requestedEnvName?: string) {
  const workspace = await resolveWorkspace();
  await ensureWorkspaceDirectories(workspace);
  return resolveEnvironmentFile(workspace.envDir, requestedEnvName);
}

async function startWorkspaceReportServer(params: {
  preferredPort: number;
  dev: boolean;
}): Promise<void> {
  const workspace = await resolveWorkspace();
  await ensureWorkspaceDirectories(workspace);
  await loadRunIndex(workspace.artifactsDir);
  const server = await startOrReuseWorkspaceReportServer({
    workspace,
    requestedPort: params.preferredPort,
    dev: params.dev,
  });
  const workspaceUrl = buildWorkspaceReportUrl(server.url);
  console.log(
    `${server.reused ? 'Reusing' : 'Started'} FinalRun report server at ${workspaceUrl}`,
  );
  await openUrlBestEffort(workspaceUrl);
}

async function openUrlBestEffort(url: string): Promise<void> {
  try {
    await openReportUrl(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Could not open the browser automatically: ${message}`);
  }
}
