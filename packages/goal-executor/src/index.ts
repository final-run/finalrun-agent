// Barrel export for @finalrun/goal-executor

export { TestExecutor } from './TestExecutor.js';
export type {
  TestExecutorConfig,
  ExecutionStatus,
  TestExecutionResult,
  TestRecordingResult,
  AgentActionResult,
  ExecutionProgressCallback,
  ExecutionProgressEvent,
} from './TestExecutor.js';

export { ActionExecutor } from './ActionExecutor.js';
export type { ActionInput, ActionOutput } from './ActionExecutor.js';

export { MultiDeviceTestExecutor } from './MultiDeviceTestExecutor.js';
export type {
  MultiDeviceExecutorConfig,
  MultiDeviceTestExecutionResult,
  MultiDeviceStepResult,
} from './MultiDeviceTestExecutor.js';

export { AIAgent } from './ai/AIAgent.js';
export type { PlannerRequest, PlannerResponse, GrounderRequest, GrounderResponse } from './ai/AIAgent.js';

export { VisualGrounder } from './ai/VisualGrounder.js';
export type { VisualGroundingResult } from './ai/VisualGrounder.js';
export { FatalProviderError } from './ai/providerFailure.js';
export type { TerminalFailureSignal } from './ai/providerFailure.js';

export { GrounderResponseConverter, ConversionResult } from './GrounderResponseConverter.js';
export type {
  TraceSpan,
  StepTrace,
  SpanTiming,
  TimingMetadata,
  LLMTrace,
  LLMCallTrace,
} from './trace.js';
