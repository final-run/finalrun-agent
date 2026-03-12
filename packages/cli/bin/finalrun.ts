#!/usr/bin/env node
// Port of mobile_cli/bin/mobile_cli.dart
// CLI entry point — parses arguments and runs the goal.

import { Command } from 'commander';
import * as fs from 'fs';
import { Logger, LogLevel } from '@finalrun/common';
import { CliEnv } from '../src/env.js';
import { runGoal } from '../src/goalRunner.js';

// ============================================================================
// CLI definition
// ============================================================================

const program = new Command()
  .name('finalrun')
  .description('AI-driven mobile app testing from the terminal')
  .version('0.1.0')
  .option('--env <name>', 'Environment name (dev/prod/local)', 'dev')
  .option('--api-key <key>', 'API key for the LLM provider')
  .option(
    '--model <provider/model>',
    'LLM model in provider/model format (e.g. openai/gpt-4o, google/gemini-2.0-flash)',
    'openai/gpt-4o',
  )
  .option('--file <path>', 'Read goal text from a file')
  .option('--debug', 'Enable debug logging', false)
  .option('--max-iterations <n>', 'Maximum iterations before giving up', '50')
  .argument('[goal...]', 'Goal text (e.g. "Tap on Login button")')
  .action(async (goalWords: string[], options: Record<string, string | boolean>) => {
    try {
      await main(goalWords, options);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n\x1b[31m✖ Error:\x1b[0m ${msg}\n`);
      process.exit(1);
    }
  });

program.parse();

// ============================================================================
// Main logic
// ============================================================================

async function main(
  goalWords: string[],
  options: Record<string, string | boolean>,
): Promise<void> {
  // -- Set up logging --
  const debug = options['debug'] === true;
  Logger.init({ level: debug ? LogLevel.DEBUG : LogLevel.INFO });

  // -- Load environment --
  const env = new CliEnv();
  env.load(options['env'] as string);

  // -- Resolve API key --
  let apiKey = options['apiKey'] as string | undefined;
  if (!apiKey) {
    apiKey = env.get('API_KEY') ?? env.get('OPENAI_API_KEY') ?? env.get('GOOGLE_API_KEY') ?? env.get('ANTHROPIC_API_KEY');
  }
  if (!apiKey) {
    throw new Error(
      'API key is required. Provide via --api-key flag or API_KEY / OPENAI_API_KEY env variable.',
    );
  }

  // -- Parse model string --
  const modelStr = options['model'] as string;
  const slashIndex = modelStr.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelStr}". Expected format: provider/model (e.g. openai/gpt-4o)`,
    );
  }
  const provider = modelStr.substring(0, slashIndex);
  const modelName = modelStr.substring(slashIndex + 1);

  // -- Resolve goal text --
  let goal: string;
  if (options['file']) {
    const filePath = options['file'] as string;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Goal file not found: ${filePath}`);
    }
    goal = fs.readFileSync(filePath, 'utf-8').trim();
  } else if (goalWords.length > 0) {
    goal = goalWords.join(' ');
  } else {
    throw new Error(
      'Goal is required. Provide as argument or via --file flag.\n' +
        'Example: finalrun "Tap on the Login button"',
    );
  }

  // -- Run the goal --
  const result = await runGoal({
    goal,
    apiKey,
    provider,
    modelName,
    maxIterations: parseInt(options['maxIterations'] as string, 10) || 50,
    debug,
  });

  // Exit with appropriate code
  process.exit(result.success ? 0 : 1);
}
