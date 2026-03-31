import { APICallError } from 'ai';

export type FatalProviderStatusCode = 400 | 401;

export interface TerminalFailureSignal {
  kind: 'provider';
  provider: string;
  modelName: string;
  statusCode: FatalProviderStatusCode;
  message: string;
}

export class FatalProviderError extends Error {
  readonly provider: string;
  readonly modelName: string;
  readonly statusCode: FatalProviderStatusCode;

  constructor(params: {
    provider: string;
    modelName: string;
    statusCode: FatalProviderStatusCode;
    detail: string;
    cause?: unknown;
  }) {
    super(
      `AI provider error (${params.provider}/${params.modelName}, HTTP ${params.statusCode}): ${params.detail}`,
    );
    this.name = 'FatalProviderError';
    this.provider = params.provider;
    this.modelName = params.modelName;
    this.statusCode = params.statusCode;
    if (params.cause !== undefined) {
      this.cause = params.cause;
    }
  }

  static isInstance(error: unknown): error is FatalProviderError {
    return error instanceof FatalProviderError;
  }

  toSignal(): TerminalFailureSignal {
    return {
      kind: 'provider',
      provider: this.provider,
      modelName: this.modelName,
      statusCode: this.statusCode,
      message: this.message,
    };
  }
}

export function classifyFatalProviderError(
  error: unknown,
  context: {
    provider: string;
    modelName: string;
  },
): FatalProviderError | undefined {
  if (FatalProviderError.isInstance(error)) {
    return error;
  }

  if (
    APICallError.isInstance(error) &&
    (error.statusCode === 400 || error.statusCode === 401)
  ) {
    return new FatalProviderError({
      provider: context.provider,
      modelName: context.modelName,
      statusCode: error.statusCode,
      detail: normalizeDetail(error.message),
      cause: error,
    });
  }

  return undefined;
}

export function terminalFailureFromError(
  error: unknown,
): TerminalFailureSignal | undefined {
  if (FatalProviderError.isInstance(error)) {
    return error.toSignal();
  }

  if (error instanceof Error && error.cause !== undefined) {
    return terminalFailureFromError(error.cause);
  }

  return undefined;
}

function normalizeDetail(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized === '' ? 'Request failed' : normalized;
}
