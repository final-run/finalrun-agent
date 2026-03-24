#!/usr/bin/env node
// Port of mobile_cli/bin/mobile_cli.dart
// CLI entry point — parses arguments and runs the goal.

import * as path from 'node:path';
import { Command } from 'commander';
import { Logger, LogLevel } from '@finalrun/common';
import { CliEnv, parseModel } from '../src/env.js';
import { resolveApiKey } from '../src/apiKey.js';
import { runCheck } from '../src/checkRunner.js';
import { serveReportArtifacts } from '../src/reportServer.js';
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
  .argument('[selectors...]', 'Optional YAML files, directories, or globs under .finalrun/tests/')
  .action(async (selectors: string[] | undefined, options: CheckCommandOptions) => {
    await runCommand(async () => {
      Logger.init({ level: LogLevel.INFO, resetSinks: true });
      const resolvedEnvironment = await resolveCliEnvironment(options.env);
      const result = await runCheck({
        envName: resolvedEnvironment.usesEmptyBindings
          ? undefined
          : resolvedEnvironment.envName,
        selectors: normalizeSpecSelectors(selectors),
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
        console.log(`\nOpen ${path.join(workspace.artifactsDir, 'index.html')}`);
      }
    });
  });

program
  .command('test')
  .description('Run repo-local FinalRun YAML specs')
  .option('--env <name>', 'Environment name (for example dev or staging)')
  .option('--platform <platform>', 'Target platform (android or ios)')
  .option('--app <path>', 'Optional app override (.apk or .app)')
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
      if (normalizedSelectors.length === 0) {
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
        platform: options.platform,
        appPath: options.app,
        apiKey,
        provider: model.provider,
        modelName: model.modelName,
        maxIterations: parseInt(options.maxIterations, 10) || 50,
        debug,
      });

      console.log(`Artifacts written to ${result.runDir}`);
      console.log(`Run index available at ${result.runIndexPath}`);
      process.exit(result.success ? 0 : 1);
    });
  });

const reportCommand = program
  .command('report')
  .description('Report helpers for local FinalRun artifacts');

reportCommand
  .command('serve')
  .description('Serve .finalrun/artifacts over a local static HTTP server')
  .option('--port <n>', 'Port to bind to', '4173')
  .action(async (options: ReportServeCommandOptions) => {
    await runCommand(async () => {
      const workspace = await resolveWorkspace();
      await ensureWorkspaceDirectories(workspace);
      await loadRunIndex(workspace.artifactsDir);
      const server = await serveReportArtifacts({
        artifactsDir: workspace.artifactsDir,
        port: parseInt(options.port, 10) || 4173,
      });
      console.log(`Serving FinalRun reports at ${server.url}`);
      const handleSignal = async () => {
        await server.close();
        process.exit(0);
      };
      process.once('SIGINT', () => {
        void handleSignal();
      });
      process.once('SIGTERM', () => {
        void handleSignal();
      });
      await new Promise(() => {});
    });
  });

program.parse();

interface CheckCommandOptions {
  env?: string;
  platform?: string;
  app?: string;
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
