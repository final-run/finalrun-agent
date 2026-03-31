import { PROVIDER_ENV_VARS, type CliEnv } from './env.js';

export function resolveApiKey(params: {
  env: Pick<CliEnv, 'get'>;
  provider: string;
  providedApiKey?: string;
}): string {
  if (params.providedApiKey) {
    return params.providedApiKey;
  }

  const providerEnvVar =
    PROVIDER_ENV_VARS[params.provider as keyof typeof PROVIDER_ENV_VARS];
  const apiKey = providerEnvVar ? params.env.get(providerEnvVar) : undefined;

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
    return `API key is required for provider "${provider}". Provide via --api-key or ${providerEnvVar}.`;
  }

  return `API key is required for provider "${provider}". Provide via --api-key.`;
}
