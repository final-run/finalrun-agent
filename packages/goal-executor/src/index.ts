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

export { AIAgent } from './ai/AIAgent.js';
export type {
  PlannerRequest,
  PlannerResponse,
  PlannerAction,
  MultiDeviceActiveState,
  MultiDevicePlannerRequest,
  MultiDevicePlannerResponse,
  GrounderRequest,
  GrounderResponse,
} from './ai/AIAgent.js';

export { MultiDeviceOrchestrator } from './MultiDeviceOrchestrator.js';
export type {
  MultiDeviceOrchestratorConfig,
  MultiDeviceOrchestratorDeviceInput,
  MultiDeviceExecutionResult,
  MultiDeviceExecutionStatus,
  MultiDeviceStepResult,
  MultiDeviceRecordingMetadata,
} from './MultiDeviceOrchestrator.js';

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
} from './trace.js';
