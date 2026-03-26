import { z } from 'zod';

/**
 * Strict schema for a single FinalRun YAML test scenario.
 * 
 * All generated tests must follow this structure exactly to be 
 * consider valid by the'frtestspec validate' command.
 */
export const testScenarioSchema = z.object({
  /** Human-readable name of the test case. */
  name: z.string(),
  /** Brief explanation of what the test covers. */
  description: z.string(),
  /** List of state conditions that must be true before the test starts. */
  preconditions: z.array(z.string()),
  /** List of setup actions (e.g., login, navigate) to perform. */
  setup: z.array(z.string()),
  /** The sequence of user interactions being tested. */
  steps: z.array(z.string()),
  /** The expected outcomes and UI states to verify. */
  assertions: z.array(z.string()),
}).strict();

/**
 * Strict schema for a FinalRun suite.
 * 
 * A suite groups multiple tests together for bulk execution.
 */
export const suiteSchema = z.object({
  /** Human-readable name of the suite. */
  name: z.string(),
  /** Detailed description of the suite's purpose. */
  description: z.string(),
  /** List of workspace-relative paths to test files included in the suite. */
  tests: z.array(z.string()).min(1),
}).strict();

