import type { CliEnv } from './env.js';

const PROVIDER_ENV_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export function resolveApiKey(params: {
  env: Pick<CliEnv, 'get'>;
  provider: string;
  providedApiKey?: string;
}): string {
  if (params.providedApiKey) {
    return params.providedApiKey;
  }

  const providerEnvVar = PROVIDER_ENV_VARS[params.provider];
  const apiKey =
    (providerEnvVar ? params.env.get(providerEnvVar) : undefined) ??
    params.env.get('API_KEY');

  if (!apiKey) {
    throw new Error(buildMissingApiKeyError(params.provider, providerEnvVar));
  }

  return apiKey;
}

function buildMissingApiKeyError(
  provider: string,
  providerEnvVar?: string,
): string {
  if (providerEnvVar) {
    return `API key is required for provider "${provider}". Provide via --api-key, ${providerEnvVar}, or API_KEY.`;
  }

  return `API key is required for provider "${provider}". Provide via --api-key or API_KEY.`;
}
