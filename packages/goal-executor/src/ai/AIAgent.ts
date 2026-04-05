// AIAgent.ts — Replaces FinalRunAgent.dart
// Uses Vercel AI SDK for direct LLM calls instead of backend API.
// Dart: FinalRunAgent → TypeScript: AIAgent

import { generateText } from 'ai';
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
  roundDuration,
  startTracePhase,
  type LLMTrace,
} from '../trace.js';
import { classifyFatalProviderError } from './providerFailure.js';

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
  private _modelName: string; // e.g., 'gpt-4o', 'gemini-2.0-flash'
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
    const llmPhase = startTracePhase(
      request.traceStep,
      'planning.llm',
      `provider=${this._provider} model=${this._modelName}`,
    );
    const llmStartedAt = performance.now();

    let rawResult: string;
    try {
      rawResult = await this._callLLM(systemPrompt, userParts, 'planner');
    } catch (error) {
      finishTracePhase(
        llmPhase,
        'failure',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    const llmMs = roundDuration(performance.now() - llmStartedAt);
    finishTracePhase(
      llmPhase,
      'success',
      describeLLMTrace({
        promptBuildMs,
        llmMs,
      }),
    );

    const parsePhase = startTracePhase(request.traceStep, 'planning.parse');
    const parseStartedAt = performance.now();
    try {
      const parsed = this._parsePlannerResponse(rawResult);
      const parseMs = roundDuration(performance.now() - parseStartedAt);
      finishTracePhase(parsePhase, 'success');
      return {
        ...parsed,
        trace: {
          totalMs: promptBuildMs + llmMs + parseMs,
          promptBuildMs,
          llmMs,
          parseMs,
        },
      };
    } catch (error) {
      finishTracePhase(
        parsePhase,
        'failure',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Call the AI grounder to find an element on screen.
   *
   * Dart: Future<Map<String, dynamic>> ground(...)
   */
  async ground(request: GrounderRequest): Promise<GrounderResponse> {
    const phaseName = request.tracePhase ?? 'action.ground';
    const phase = startTracePhase(
      request.traceStep,
      phaseName,
      `feature=${request.feature}`,
    );
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
    const llmStartedAt = performance.now();

    let rawResult: string;
    try {
      rawResult = await this._callLLM(systemPrompt, userParts, 'grounder');
    } catch (error) {
      finishTracePhase(
        phase,
        'failure',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    const llmMs = roundDuration(performance.now() - llmStartedAt);
    const parseStartedAt = performance.now();

    try {
      const parsed = this._parseGrounderResponse(rawResult);
      const parseMs = roundDuration(performance.now() - parseStartedAt);
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
      return {
        ...parsed,
        trace: {
          totalMs: promptBuildMs + llmMs + parseMs,
          promptBuildMs,
          llmMs,
          parseMs,
        },
      };
    } catch (error) {
      finishTracePhase(
        phase,
        'failure',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  // ---------- private ----------

  /**
   * Call an LLM via Vercel AI SDK.
   */
  private async _callLLM(
    systemPrompt: string,
    userParts: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }>,
    phase: LLMPhase,
  ): Promise<string> {
    const model = this._getModel();
    const providerOptions = this._getProviderOptions(phase);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = userParts.map((part) => {
      if (part.type === 'image') {
        return { type: 'image' as const, image: part.image };
      }
      return { type: 'text' as const, text: part.text };
    });

    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await generateText({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        maxOutputTokens: 4096,
        providerOptions,
      });
    } catch (error) {
      throw (
        classifyFatalProviderError(error, {
          provider: this._provider,
          modelName: this._modelName,
        }) ?? error
      );
    }

    if (result.reasoningText) {
      Logger.d(
        `LLM reasoning (${this._provider}/${this._modelName}):\n${result.reasoningText}`,
      );
    }

    Logger.d(
      `LLM response (${this._provider}/${this._modelName}):\n${result.text || '<empty response>'}`,
    );
    return result.text;
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
   * Parse the planner LLM response into PlannerResponse.
   * The planner prompt returns JSON like:
   * {"output":{"thought":{...},"action":{"action_type":"tap"},"remember":[]}}
   */
  private _parsePlannerResponse(raw: string): PlannerResponse {
    const json = this._extractJson(raw);
    if (!json) {
      throw new Error(
        `Failed to parse planner response with top-level output: ${raw.substring(0, 200)}`,
      );
    }

    const normalized = normalizePlannerResponse(json);
    if (!normalized.act) {
      throw new Error(`Planner response missing actionable action_type: ${raw.substring(0, 300)}`);
    }

    return normalized;
  }

  /**
   * Parse the grounder LLM response into GrounderResponse.
   * The grounder returns JSON like: {"output": {"index": 42, "reason": "..."}}
   */
  private _parseGrounderResponse(raw: string): GrounderResponse {
    const json = this._extractJson(raw);
    if (!json) {
      throw new Error(
        `Failed to parse grounder response with top-level output: ${raw.substring(0, 200)}`,
      );
    }

    const output = asRecord(json['output']) ?? json;
    return { output, raw };
  }

  /**
   * Extract JSON from LLM response, requiring a top-level output object.
   */
  private _extractJson(raw: string): JsonRecord | null {
    const directParsed = tryParseJsonRecord(raw);
    if (directParsed && asRecord(directParsed['output'])) {
      return directParsed;
    }

    const extracted = extractJsonContainingOutput(raw);
    if (!extracted) {
      Logger.w('Failed to extract JSON with top-level output from LLM response');
      return null;
    }

    const parsed = tryParseJsonRecord(extracted);
    if (parsed && asRecord(parsed['output'])) {
      return parsed;
    }

    Logger.w('Failed to parse extracted JSON with top-level output from LLM response');
    return null;
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

function tryParseJsonRecord(raw: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(raw);
    return asRecord(parsed) ?? null;
  } catch {
    return null;
  }
}

function extractJsonContainingOutput(text: string): string | null {
  const key = '"output"';
  const keyIndex = text.indexOf(key);
  if (keyIndex === -1) {
    return null;
  }

  // Find the opening brace for the smallest object containing "output".
  const openIndex = text.lastIndexOf('{', keyIndex);
  if (openIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.substring(openIndex, index + 1);
      }
    }
  }

  return null;
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
