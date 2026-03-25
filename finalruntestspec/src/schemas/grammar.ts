import { z } from 'zod';

export const testScenarioSchema = z.object({
  name: z.string(),
  description: z.string(),
  preconditions: z.array(z.string()),
  setup: z.array(z.string()),
  steps: z.array(z.string()),
  assertions: z.array(z.string()),
}).strict();

export const testsuiteSchema = z.object({
  name: z.string(),
  description: z.string(),
  tests: z.array(z.string()).min(1),
}).strict();

