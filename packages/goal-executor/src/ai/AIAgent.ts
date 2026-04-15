// AIAgent.ts — Replaces FinalRunAgent.dart
// Uses Vercel AI SDK for direct LLM calls instead of backend API.
// Dart: FinalRunAgent → TypeScript: AIAgent

import { generateText, Output } from 'ai';
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from '@ai-sdk/openai';
import {
  createGoogleGenerativeAI,
  type GoogleLanguageModelOptions,
} from '@ai-sdk/google';
import {
  createAnthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'node:perf_hooks';
import {
  Logger,
  Hierarchy,
  FEATURE_PLANNER,
  FEATURE_GROUNDER,
  FEATURE_VISUAL_GROUNDER,
  FEATURE_SCROLL_INDEX_GROUNDER,
  FEATURE_INPUT_FOCUS_GROUNDER,
  FEATURE_LAUNCH_APP_GROUNDER,
  FEATURE_SET_LOCATION_GROUNDER,
  PLANNER_ACTION_TAP,
  PLANNER_ACTION_LONG_PRESS,
  PLANNER_ACTION_TYPE,
  PLANNER_ACTION_SCROLL,
  PLANNER_ACTION_BACK,
  PLANNER_ACTION_HOME,
  PLANNER_ACTION_ROTATE,
  PLANNER_ACTION_HIDE_KEYBOARD,
  PLANNER_ACTION_PRESS_ENTER,
  PLANNER_ACTION_LAUNCH_APP,
  PLANNER_ACTION_SET_LOCATION,
  PLANNER_ACTION_WAIT,
  PLANNER_ACTION_COMPLETED,
  PLANNER_ACTION_FAILED,
  PLANNER_ACTION_DEEPLINK,
} from '@finalrun/common';
import {
  describeLLMTrace,
  finishTracePhase,
  formatPlannerReasoning,
  formatGrounderRequest,
  formatGrounderResult,
  roundDuration,
  startTracePhase,
  type LLMTrace,
} from '../trace.js';
import { classifyFatalProviderError, FatalProviderError } from './providerFailure.js';

// ============================================================================
// Types
// ============================================================================

export interface PlannerRequest {
  testObjective: string;
  platform: string;
  preActionScreenshot?: string; // base64
  postActionScreenshot?: string; // base64
  hierarchy?: Hierarchy;
  history?: string;
  remember?: string[];
  preContext?: string;
  appKnowledge?: string;
  postActionHierarchy?: Hierarchy;
  traceStep?: number;
}

export interface PlannerResponse {
  act: string;
  reason: string;
  remember: string[];
  text?: string;
  clearText?: boolean;
  direction?: string;
  durationSeconds?: number;
  url?: string;
  result?: string;
  analysis?: string;
  severity?: string;
  repeat?: number;
  delayBetweenTapMs?: number;
  thought?: {
    plan?: string;
    think?: string;
    act?: string;
  };
  trace?: LLMTrace;
}

export interface GrounderRequest {
  feature: string;
  act: string;
  hierarchy?: Hierarchy;
  screenshot?: string; // base64
  platform?: string;
  availableApps?: Array<{ packageName: string; name: string }>;
  traceStep?: number;
  tracePhase?: string;
}

/**
 * Structural action shape returned inside a `MultiDevicePlannerResponse`.
 * Mirrors the union of fields supported by `PlannerResponse` (single-device)
 * so the multi-device orchestrator can feed entries directly into the same
 * `ActionExecutor` interface without duplicating normalization logic.
 *
 * Single-device callers MUST NOT import this type — `PlannerResponse` remains
 * the canonical single-device shape.
 */
export interface PlannerAction {
  act: string;
  reason: string;
  text?: string;
  clearText?: boolean;
  direction?: string;
  durationSeconds?: number;
  url?: string;
  repeat?: number;
  delayBetweenTapMs?: number;
  result?: string;
  analysis?: string;
  severity?: string;
}

export interface MultiDeviceActiveState {
  preActionScreenshot?: string; // base64, optional on a device's first appearance
  postActionScreenshot: string; // base64, always present for an active device
  hierarchy: Hierarchy;
  platform: string;
}

export interface MultiDevicePlannerRequest {
  testObjective: string;
  /** Configured device keys — used to validate planner responses reference
   *  known devices only. `activeDeviceStates` keys MUST be a subset of this. */
  devices: string[];
  /** Active-device-scoped state map. Only devices referenced by the current
   *  step are present (1 or 2). Passive devices are absent from the map. */
  activeDeviceStates: Record<string, MultiDeviceActiveState>;
  history?: string;
  remember?: Array<{ device: string; note: string }>;
  preContext?: string;
  traceStep?: number;
}

export interface MultiDevicePlannerResponse {
  /** 0-2 device-tagged actions. 0 = observation-only turn, 1 = sequential,
   *  2 = parallel (distinct devices). Duplicate devices or >2 entries are
   *  validation failures — `planMulti` retries once, then throws. */
  actions: Array<{ device: string; action: PlannerAction }>;
  remember: Array<{ device: string; note: string }>;
  thought?: {
    plan?: string;
    think?: string;
    act?: string;
  };
  trace?: LLMTrace;
}

export interface GrounderResponse {
  output: Record<string, unknown>;
  raw: string; // Raw LLM response for debugging
  trace?: LLMTrace;
}

type JsonRecord = Record<string, unknown>;
type LLMPhase = 'planner' | 'grounder';
type AIAgentProviderOptions = {
  google?: GoogleLanguageModelOptions;
  openai?: OpenAILanguageModelResponsesOptions;
  anthropic?: AnthropicLanguageModelOptions;
};

const MAX_LLM_ATTEMPTS = 2;

// ============================================================================
// AIAgent
// ============================================================================

/**
 * Handles all AI interactions — planning and grounding.
 * Replaces FinalRunAgent.dart, calling LLMs directly via Vercel AI SDK.
 *
 * Dart equivalent: FinalRunAgent in goal_executor/lib/src/FinalRunAgent.dart
 */
export class AIAgent {
  private _provider: string; // e.g., 'openai', 'google', 'anthropic'
  private _modelName: string; // e.g., 'gpt-5.4-mini', 'gemini-2.0-flash'
  private _apiKey: string;

  // Cached prompt contents
  private _promptCache: Map<string, string> = new Map();

  constructor(params: { provider: string; modelName: string; apiKey: string }) {
    this._provider = params.provider;
    this._modelName = params.modelName;
    this._apiKey = params.apiKey;
  }

  /**
   * Call the AI planner to decide the next action.
   *
   * Dart: Future<Map<String, dynamic>> plan(...)
   */
  async plan(request: PlannerRequest): Promise<PlannerResponse> {
    const promptBuildStartedAt = performance.now();
    const systemPrompt = this._loadPrompt('planner');

    const userParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];

    if (request.preActionScreenshot) {
      userParts.push({ type: 'image', image: request.preActionScreenshot });
    }

    let textPrompt = `Test objective: ${request.testObjective}\n`;
    textPrompt += `Platform: ${request.platform}\n`;

    if (request.history) {
      textPrompt += `\nHistory of actions taken so far:\n${request.history}\n`;
    }

    if (request.remember && request.remember.length > 0) {
      textPrompt += `\nImportant context to remember:\n${JSON.stringify(request.remember)}\n`;
    }

    if (request.preContext) {
      textPrompt += `\nPre-context:\n${request.preContext}\n`;
    }

    if (request.appKnowledge) {
      textPrompt += `\nApp knowledge:\n${request.appKnowledge}\n`;
    }

    if (request.hierarchy) {
      const elements = request.hierarchy.toPromptElements();
      textPrompt += `\nui_elements:\n${JSON.stringify(elements)}\n`;
    }

    if (request.postActionScreenshot) {
      userParts.push({ type: 'image', image: request.postActionScreenshot });
    }

    if (request.postActionHierarchy) {
      const postElements = request.postActionHierarchy.toPromptElements();
      textPrompt += `\nPost-action ui_elements:\n${JSON.stringify(postElements)}\n`;
    }

    userParts.push({ type: 'text', text: textPrompt });

    const promptBuildMs = roundDuration(performance.now() - promptBuildStartedAt);

    const maxAttempts = MAX_LLM_ATTEMPTS;
    let lastError: unknown;
    let parsedResponse: PlannerResponse | undefined;
    let llmMs = 0;
    let parseMs = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const llmPhase = startTracePhase(
        request.traceStep,
        'planning.llm',
        `provider=${this._provider} model=${this._modelName} attempt=${attempt}/${maxAttempts}`,
      );
      const llmStartedAt = performance.now();

      let rawOutput: unknown;
      let rawText: string;
      try {
        const llmResult = await this._callLLM(systemPrompt, userParts, 'planner');
        rawOutput = llmResult.output;
        rawText = llmResult.text;
      } catch (error) {
        finishTracePhase(
          llmPhase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        if (FatalProviderError.isInstance(error)) {
          throw error;
        }
        lastError = error;
        if (attempt < maxAttempts) {
          Logger.w(
            `Planner attempt ${attempt}/${maxAttempts} failed (llm), retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }

      llmMs = roundDuration(performance.now() - llmStartedAt);
      finishTracePhase(
        llmPhase,
        'success',
        describeLLMTrace({ promptBuildMs, llmMs }),
      );

      const parsePhase = startTracePhase(
        request.traceStep,
        'planning.parse',
        `attempt=${attempt}/${maxAttempts}`,
      );
      const parseStartedAt = performance.now();
      try {
        parsedResponse = this._parsePlannerResponse(rawOutput, rawText);
        parseMs = roundDuration(performance.now() - parseStartedAt);
        finishTracePhase(parsePhase, 'success');
        break;
      } catch (error) {
        finishTracePhase(
          parsePhase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        lastError = error;
        if (attempt < maxAttempts) {
          Logger.w(
            `Planner attempt ${attempt}/${maxAttempts} failed (parse), retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }
    }

    if (!parsedResponse) {
      throw lastError ?? new Error('Planner failed after all retry attempts');
    }

    if (request.traceStep !== undefined) {
      Logger.i(formatPlannerReasoning({
        step: request.traceStep,
        thought: parsedResponse.thought,
        action: parsedResponse.act,
        reason: parsedResponse.reason,
      }));
    }

    return {
      ...parsedResponse,
      trace: {
        totalMs: promptBuildMs + llmMs + parseMs,
        promptBuildMs,
        llmMs,
        parseMs,
      },
    };
  }

  /**
   * Multi-device planner — sibling to `plan()`. Uses the same Vercel AI SDK
   * path (`_callLLM`) and the same retry count, but loads the multi-device
   * prompt and validates a multi-action response shape.
   *
   * Validation (spec CHK-028): rejects responses whose `actions` array
   *   - contains >2 entries,
   *   - contains duplicate devices,
   *   - references a device key not in `request.devices`.
   * On first failure, retries once with a corrective hint appended to the
   * user prompt. On second failure, throws the validation error.
   *
   * Single-device impact: zero. `plan()` and `PlannerResponse` are unchanged.
   */
  async planMulti(request: MultiDevicePlannerRequest): Promise<MultiDevicePlannerResponse> {
    const promptBuildStartedAt = performance.now();
    const systemPrompt = this._loadPrompt('multi-device-planner');

    const knownDevices = new Set(request.devices);
    const baseUserParts = this._buildMultiDeviceUserParts(request);
    const promptBuildMs = roundDuration(performance.now() - promptBuildStartedAt);

    const maxAttempts = MAX_LLM_ATTEMPTS;
    let lastError: unknown;
    let parsed: MultiDevicePlannerResponse | undefined;
    let llmMs = 0;
    let parseMs = 0;
    let validationHint: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const userParts =
        validationHint !== undefined
          ? [
              ...baseUserParts,
              {
                type: 'text' as const,
                text: `\nPrevious response was invalid: ${validationHint}. Emit a corrected JSON object with at most 2 actions, distinct devices, and device keys drawn from: ${request.devices.join(', ')}.\n`,
              },
            ]
          : baseUserParts;

      const llmPhase = startTracePhase(
        request.traceStep,
        'planning.llm.multi',
        `provider=${this._provider} model=${this._modelName} attempt=${attempt}/${maxAttempts}`,
      );
      const llmStartedAt = performance.now();

      let rawOutput: unknown;
      let rawText: string;
      try {
        const llmResult = await this._callLLM(systemPrompt, userParts, 'planner');
        rawOutput = llmResult.output;
        rawText = llmResult.text;
      } catch (error) {
        finishTracePhase(
          llmPhase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        if (FatalProviderError.isInstance(error)) {
          throw error;
        }
        lastError = error;
        if (attempt < maxAttempts) {
          Logger.w(
            `planMulti attempt ${attempt}/${maxAttempts} failed (llm), retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }

      llmMs = roundDuration(performance.now() - llmStartedAt);
      finishTracePhase(
        llmPhase,
        'success',
        describeLLMTrace({ promptBuildMs, llmMs }),
      );

      const parsePhase = startTracePhase(
        request.traceStep,
        'planning.parse.multi',
        `attempt=${attempt}/${maxAttempts}`,
      );
      const parseStartedAt = performance.now();
      try {
        parsed = this._parseMultiDevicePlannerResponse(rawOutput, rawText, knownDevices);
        parseMs = roundDuration(performance.now() - parseStartedAt);
        finishTracePhase(parsePhase, 'success');
        break;
      } catch (error) {
        finishTracePhase(
          parsePhase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        lastError = error;
        validationHint = error instanceof Error ? error.message : String(error);
        if (attempt < maxAttempts) {
          Logger.w(
            `planMulti attempt ${attempt}/${maxAttempts} failed (parse), retrying: ${validationHint}`,
          );
          continue;
        }
        throw error;
      }
    }

    if (!parsed) {
      throw lastError ?? new Error('planMulti failed after all retry attempts');
    }

    return {
      ...parsed,
      trace: {
        totalMs: promptBuildMs + llmMs + parseMs,
        promptBuildMs,
        llmMs,
        parseMs,
      },
    };
  }

  /**
   * Call the AI grounder to find an element on screen.
   *
   * Dart: Future<Map<String, dynamic>> ground(...)
   */
  async ground(request: GrounderRequest): Promise<GrounderResponse> {
    if (request.traceStep !== undefined) {
      Logger.i(formatGrounderRequest({
        step: request.traceStep,
        feature: request.feature,
        act: request.act,
      }));
    }

    const phaseName = request.tracePhase ?? 'action.ground';
    const promptBuildStartedAt = performance.now();
    const promptKey = this._getPromptKeyForFeature(request.feature);
    const systemPrompt = this._loadPrompt(promptKey);

    const userParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];

    if (request.screenshot) {
      userParts.push({ type: 'image', image: request.screenshot });
    }

    let text = `act: ${request.act}\n`;

    if (request.platform) {
      text += `platform: ${request.platform}\n`;
    }

    if (request.hierarchy) {
      const elements = request.hierarchy.toPromptElements();
      text += `\nui_elements:\n${JSON.stringify(elements)}\n`;
    }

    if (request.availableApps) {
      text += `\navailable_apps:\n${JSON.stringify(request.availableApps)}\n`;
    }

    userParts.push({ type: 'text', text });

    const promptBuildMs = roundDuration(performance.now() - promptBuildStartedAt);

    const maxAttempts = MAX_LLM_ATTEMPTS;
    let lastError: unknown;
    let parsed: GrounderResponse | undefined;
    let llmMs = 0;
    let parseMs = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const phase = startTracePhase(
        request.traceStep,
        phaseName,
        `feature=${request.feature} attempt=${attempt}/${maxAttempts}`,
      );
      const llmStartedAt = performance.now();

      let rawOutput: unknown;
      let rawText: string;
      try {
        const llmResult = await this._callLLM(systemPrompt, userParts, 'grounder');
        rawOutput = llmResult.output;
        rawText = llmResult.text;
      } catch (error) {
        finishTracePhase(
          phase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        if (FatalProviderError.isInstance(error)) {
          throw error;
        }
        lastError = error;
        if (attempt < maxAttempts) {
          Logger.w(
            `Grounder attempt ${attempt}/${maxAttempts} failed (llm) for feature=${request.feature}, retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }

      llmMs = roundDuration(performance.now() - llmStartedAt);
      const parseStartedAt = performance.now();

      try {
        parsed = this._parseGrounderResponse(rawOutput, rawText);
        parseMs = roundDuration(performance.now() - parseStartedAt);
        finishTracePhase(
          phase,
          'success',
          describeLLMTrace({
            promptBuildMs,
            llmMs,
            parseMs,
            extraDetail: `feature=${request.feature}`,
          }),
        );
        break;
      } catch (error) {
        finishTracePhase(
          phase,
          'failure',
          error instanceof Error ? error.message : String(error),
        );
        lastError = error;
        if (attempt < maxAttempts) {
          Logger.w(
            `Grounder attempt ${attempt}/${maxAttempts} failed (parse) for feature=${request.feature}, retrying: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        throw error;
      }
    }

    if (!parsed) {
      throw lastError ?? new Error('Grounder failed after all retry attempts');
    }

    if (request.traceStep !== undefined) {
      let bounds: [number, number, number, number] | null = null;
      const idx = parsed.output['index'];
      if (typeof idx === 'number' && request.hierarchy) {
        const node = request.hierarchy.flattenedHierarchy[idx];
        bounds = node?.bounds ?? null;
      }
      Logger.i(formatGrounderResult({
        step: request.traceStep,
        output: parsed.output,
        bounds,
      }));
    }

    return {
      ...parsed,
      trace: {
        totalMs: promptBuildMs + llmMs + parseMs,
        promptBuildMs,
        llmMs,
        parseMs,
      },
    };
  }

  // ---------- private ----------

  /**
   * Call an LLM via Vercel AI SDK. Uses Output.json() so the provider emits
   * strict JSON (Google response_mime_type, OpenAI response_format, Anthropic
   * structuredOutputMode), matching the Kotlin backend's behavior.
   */
  private async _callLLM(
    systemPrompt: string,
    userParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>,
    phase: LLMPhase,
  ): Promise<{ output: unknown; text: string }> {
    const model = this._getModel();
    const providerOptions = this._getProviderOptions(phase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = userParts.map((part) => {
      if (part.type === 'image') {
        return { type: 'image' as const, image: part.image };
      }
      return { type: 'text' as const, text: part.text };
    });

    let output: unknown;
    let text: string;
    let reasoningText: string | undefined;
    try {
      const result = await generateText({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        output: Output.json(),
        maxOutputTokens: phase === 'planner' ? 8192 : 4096,
        providerOptions,
      });
      output = result.output;
      text = result.text;
      reasoningText = result.reasoningText;
    } catch (error) {
      throw (
        classifyFatalProviderError(error, {
          provider: this._provider,
          modelName: this._modelName,
        }) ?? error
      );
    }

    if (reasoningText) {
      Logger.d(
        `LLM reasoning [${phase}] (${this._provider}/${this._modelName}):\n${reasoningText}`,
      );
    }

    Logger.d(
      `LLM response [${phase}] (${this._provider}/${this._modelName}):\n${text || '<empty response>'}`,
    );
    return { output, text };
  }

  /**
   * Create the appropriate Vercel AI SDK model instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _getModel(): any {
    switch (this._provider) {
      case 'openai': {
        const openai = createOpenAI({ apiKey: this._apiKey });
        return openai(this._modelName);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({ apiKey: this._apiKey });
        return google(this._modelName);
      }
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey: this._apiKey });
        return anthropic(this._modelName);
      }
      default:
        throw new Error(`Unsupported AI provider: ${this._provider}`);
    }
  }

  private _getProviderOptions(phase: LLMPhase): AIAgentProviderOptions | undefined {
    switch (this._provider) {
      case 'google':
        return {
          google: {
            thinkingConfig: {
              thinkingLevel: phase === 'planner' ? 'high' : 'medium',
              includeThoughts: false,
            },
          } satisfies GoogleLanguageModelOptions,
        };
      case 'openai':
        return {
          openai: {
            reasoningEffort: phase === 'planner' ? 'medium' : 'low',
          } satisfies OpenAILanguageModelResponsesOptions,
        };
      case 'anthropic':
        return {
          anthropic: {
            effort: phase === 'planner' ? 'medium' : 'low',
          } satisfies AnthropicLanguageModelOptions,
        };
      default:
        return undefined;
    }
  }

  /**
   * Load a system prompt from the bundled .md files.
   */
  private _loadPrompt(key: string): string {
    if (this._promptCache.has(key)) {
      return this._promptCache.get(key)!;
    }

    const candidates = [
      process.env['FINALRUN_PROMPTS_DIR']
        ? path.resolve(process.env['FINALRUN_PROMPTS_DIR'], `${key}.md`)
        : undefined,
      path.resolve(__dirname, `../prompts/${key}.md`),
      path.resolve(__dirname, `../../src/prompts/${key}.md`),
      path.resolve(__dirname, `../../../src/prompts/${key}.md`),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        const content = fs.readFileSync(candidate, 'utf-8');
        this._promptCache.set(key, content);
        return content;
      }
    }

    throw new Error(`Prompt file not found for key "${key}". Searched: ${candidates.join(', ')}`);
  }

  /**
   * Map feature name to prompt file name.
   */
  private _getPromptKeyForFeature(feature: string): string {
    switch (feature) {
      case FEATURE_GROUNDER:
        return 'grounder';
      case FEATURE_VISUAL_GROUNDER:
        return 'visual-grounder';
      case FEATURE_SCROLL_INDEX_GROUNDER:
        return 'scroll-grounder';
      case FEATURE_INPUT_FOCUS_GROUNDER:
        return 'input-focus-grounder';
      case FEATURE_LAUNCH_APP_GROUNDER:
        return 'launch-app-grounder';
      case FEATURE_SET_LOCATION_GROUNDER:
        return 'set-location-grounder';
      case FEATURE_PLANNER:
        return 'planner';
      default:
        return 'grounder';
    }
  }

  /**
   * Parse the planner LLM response into PlannerResponse. The SDK has already
   * parsed the JSON via Output.json(), so we just normalize the shape.
   */
  private _parsePlannerResponse(output: unknown, rawText: string): PlannerResponse {
    const record = asRecord(output);
    if (!record) {
      throw new Error(
        `Planner response is not a JSON object: ${rawText.substring(0, 200)}`,
      );
    }

    const normalized = normalizePlannerResponse(record);
    if (!normalized.act) {
      throw new Error(
        `Planner response missing actionable action_type: ${rawText.substring(0, 300)}`,
      );
    }

    return normalized;
  }

  /**
   * Parse the grounder LLM response into GrounderResponse. The SDK has already
   * parsed the JSON via Output.json(), so we just unwrap the `output` key when
   * present.
   */
  private _parseGrounderResponse(output: unknown, rawText: string): GrounderResponse {
    const record = asRecord(output);
    if (!record) {
      throw new Error(
        `Grounder response is not a JSON object: ${rawText.substring(0, 200)}`,
      );
    }

    const grounderOutput = asRecord(record['output']) ?? record;
    return { output: grounderOutput, raw: rawText };
  }

  /**
   * Build the user message parts for `planMulti()`. Per-active-device blocks
   * are emitted as interleaved image + text parts so the multimodal model can
   * correlate each screenshot with its device label.
   */
  private _buildMultiDeviceUserParts(
    request: MultiDevicePlannerRequest,
  ): Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> {
    const parts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = [];

    let header = `Test objective: ${request.testObjective}\n`;
    header += `Devices: ${request.devices.join(', ')}\n`;
    if (request.preContext) {
      header += `\nPre-context:\n${request.preContext}\n`;
    }
    if (request.history) {
      header += `\nHistory of actions taken so far:\n${request.history}\n`;
    }
    if (request.remember && request.remember.length > 0) {
      header += `\nImportant context to remember:\n${JSON.stringify(request.remember)}\n`;
    }
    parts.push({ type: 'text', text: header });

    const activeKeys = Object.keys(request.activeDeviceStates);
    for (const key of activeKeys) {
      const state = request.activeDeviceStates[key]!;
      if (state.preActionScreenshot) {
        parts.push({ type: 'image', image: state.preActionScreenshot });
      }
      parts.push({ type: 'image', image: state.postActionScreenshot });
      const elements = state.hierarchy.toPromptElements();
      parts.push({
        type: 'text',
        text: `\nDevice '${key}' (${state.platform}) ui_elements:\n${JSON.stringify(elements)}\n`,
      });
    }

    return parts;
  }

  /**
   * Parse + validate the multi-device planner response. Throws `Error` with a
   * message matching the test-guaranteed regex (`max is 2`, `duplicate device`,
   * `unknown device '<key>'`) so callers can inspect causes.
   */
  private _parseMultiDevicePlannerResponse(
    output: unknown,
    rawText: string,
    knownDevices: Set<string>,
  ): MultiDevicePlannerResponse {
    const record = asRecord(output);
    if (!record) {
      throw new Error(
        `planMulti response is not a JSON object: ${rawText.substring(0, 200)}`,
      );
    }

    const inner = asRecord(record['output']) ?? record;
    const actionsRaw = inner['actions'];
    if (!Array.isArray(actionsRaw)) {
      throw new Error(
        `planMulti response missing 'actions' array: ${rawText.substring(0, 200)}`,
      );
    }
    if (actionsRaw.length > 2) {
      throw new Error(
        `planMulti response has ${actionsRaw.length} actions — max is 2`,
      );
    }

    const seenDevices = new Set<string>();
    const normalizedActions: Array<{ device: string; action: PlannerAction }> = [];
    for (const entry of actionsRaw) {
      const entryRecord = asRecord(entry);
      if (!entryRecord) {
        throw new Error(
          `planMulti action entry is not an object: ${JSON.stringify(entry).substring(0, 120)}`,
        );
      }
      const device = normalizeString(entryRecord['device']);
      if (!device) {
        throw new Error(
          `planMulti action entry missing 'device': ${JSON.stringify(entryRecord).substring(0, 120)}`,
        );
      }
      if (!knownDevices.has(device)) {
        throw new Error(
          `planMulti response references unknown device '${device}' (known: ${[...knownDevices].join(', ')})`,
        );
      }
      if (seenDevices.has(device)) {
        throw new Error(
          `planMulti response contains duplicate device '${device}' — one action per device per iteration`,
        );
      }
      seenDevices.add(device);

      const actionBody = asRecord(entryRecord['action']);
      if (!actionBody) {
        throw new Error(
          `planMulti action for '${device}' missing 'action' body`,
        );
      }
      normalizedActions.push({
        device,
        action: normalizePlannerAction(actionBody),
      });
    }

    const rememberRaw = inner['remember'];
    const remember: Array<{ device: string; note: string }> = [];
    if (Array.isArray(rememberRaw)) {
      for (const entry of rememberRaw) {
        const entryRecord = asRecord(entry);
        if (!entryRecord) continue;
        const device = normalizeString(entryRecord['device']);
        const note = normalizeString(entryRecord['note']);
        if (device && note) {
          remember.push({ device, note });
        }
      }
    }

    const thoughtRecord = asRecord(inner['thought']);
    const thought = thoughtRecord
      ? {
          plan: normalizeString(thoughtRecord['plan']),
          think: normalizeString(thoughtRecord['think']),
          act: normalizeString(thoughtRecord['act']),
        }
      : undefined;

    return {
      actions: normalizedActions,
      remember,
      thought,
    };
  }
}

function normalizePlannerResponse(json: JsonRecord): PlannerResponse {
  const output = asRecord(json['output']) ?? json;
  const thought = asRecord(output['thought']);
  const action =
    asRecord(output['action']) ??
    asRecord(json['action']) ??
    (normalizeString(output['action_type']) ? output : undefined) ??
    (normalizeString(json['action_type']) ? json : undefined);

  if (!action) {
    if (typeof json['act'] === 'string') {
      return {
        act: json['act'],
        reason: normalizeString(json['reason']) ?? '',
        remember: normalizeRemember(json['remember']),
      };
    }

    return {
      act: '',
      reason: '',
      remember: normalizeRemember(output['remember']),
    };
  }

  const normalizedAction = normalizePromptAction(
    normalizeString(action['action_type']) ?? '',
    action,
  );
  const thoughtAct = normalizeString(thought?.['act']);
  const isTerminalAction =
    normalizedAction.act === PLANNER_ACTION_COMPLETED ||
    normalizedAction.act === PLANNER_ACTION_FAILED;

  return {
    act: normalizedAction.act,
    reason: isTerminalAction
      ? normalizedAction.reason
      : firstNonEmpty(thoughtAct, normalizedAction.reason) ?? '',
    remember: normalizeRemember(output['remember']),
    text: normalizeString(action['text']),
    clearText: normalizeBoolean(action['clear_text']),
    direction: normalizeString(action['direction']),
    durationSeconds: normalizeNumber(action['duration']),
    url: normalizeString(action['url']),
    result: normalizeString(action['result']),
    analysis: normalizeString(action['analysis']),
    severity: normalizeString(action['severity']),
    repeat: normalizeNumber(action['repeat']),
    delayBetweenTapMs: normalizeNumber(
      action['delay_between_tap'] ?? action['delayBetweenTap'],
    ),
    thought: thought
      ? {
          plan: normalizeString(thought['plan']),
          think: normalizeString(thought['think']),
          act: thoughtAct,
        }
      : undefined,
  };
}

function normalizePromptAction(
  actionType: string,
  action: JsonRecord,
): { act: string; reason: string } {
  switch (actionType) {
    case 'tap':
      return { act: PLANNER_ACTION_TAP, reason: 'Tap the target element.' };
    case 'long_press':
      return { act: PLANNER_ACTION_LONG_PRESS, reason: 'Long press the target element.' };
    case 'input_text':
      return { act: PLANNER_ACTION_TYPE, reason: 'Type text into the target input field.' };
    case 'swipe':
      return {
        act: PLANNER_ACTION_SCROLL,
        reason: firstNonEmpty(
          normalizeString(action['act']),
          normalizeString(action['direction']) ? `Swipe ${normalizeString(action['direction'])}` : undefined,
          'Scroll the current view.',
        ) ?? 'Scroll the current view.',
      };
    case 'navigate_home':
      return { act: PLANNER_ACTION_HOME, reason: 'Navigate to the device home screen.' };
    case 'rotate':
      return { act: PLANNER_ACTION_ROTATE, reason: 'Rotate the device orientation.' };
    case 'navigate_back':
      return { act: PLANNER_ACTION_BACK, reason: 'Navigate back one screen.' };
    case 'hide_keyboard':
      return { act: PLANNER_ACTION_HIDE_KEYBOARD, reason: 'Hide the software keyboard.' };
    case 'keyboard_enter':
      return { act: PLANNER_ACTION_PRESS_ENTER, reason: 'Press the enter key.' };
    case 'wait':
      return { act: PLANNER_ACTION_WAIT, reason: 'Wait for the UI to stabilize.' };
    case 'deep_link':
      return { act: PLANNER_ACTION_DEEPLINK, reason: 'Open the deeplink URL.' };
    case 'set_location':
      return { act: PLANNER_ACTION_SET_LOCATION, reason: 'Set the device location.' };
    case 'launch_app':
      return { act: PLANNER_ACTION_LAUNCH_APP, reason: 'Launch the target app.' };
    case 'status': {
      const result = normalizeString(action['result'])?.toLowerCase();
      return {
        act: result === 'success' ? PLANNER_ACTION_COMPLETED : PLANNER_ACTION_FAILED,
        reason: firstNonEmpty(
          normalizeString(action['analysis']),
          normalizeString(action['result']),
          'Planner returned final status.',
        ) ?? 'Planner returned final status.',
      };
    }
    default:
      return {
        act: actionType,
        reason: `Planner returned unsupported action_type: ${actionType}`,
      };
  }
}

function normalizePlannerAction(action: JsonRecord): PlannerAction {
  const actionType = normalizeString(action['action_type']) ?? '';
  const mapped = normalizePromptAction(actionType, action);
  return {
    act: mapped.act,
    reason: firstNonEmpty(normalizeString(action['reason']), mapped.reason) ?? mapped.reason,
    text: normalizeString(action['text']),
    clearText: normalizeBoolean(action['clear_text']),
    direction: normalizeString(action['direction']),
    durationSeconds: normalizeNumber(action['duration']),
    url: normalizeString(action['url']),
    repeat: normalizeNumber(action['repeat']),
    delayBetweenTapMs: normalizeNumber(
      action['delay_between_tap'] ?? action['delayBetweenTap'],
    ),
    result: normalizeString(action['result']),
    analysis: normalizeString(action['analysis']),
    severity: normalizeString(action['severity']),
  };
}

function asRecord(value: unknown): JsonRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonRecord;
}

function normalizeRemember(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      try {
        return JSON.stringify(item);
      } catch {
        return String(item);
      }
    })
    .filter((item): item is string => item.length > 0);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}
