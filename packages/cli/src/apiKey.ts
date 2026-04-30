import { PROVIDER_ENV_VARS, type CliEnv } from '@finalrun/common';

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

/**
 * Resolve API keys for every provider referenced by the current run.
 *
 * --api-key is accepted only when a single provider is in play; mixing
 * providers across features requires env vars per provider (documented in
 * docs/environment.md) so we can't silently pair one key with multiple
 * providers.
 */
export function resolveApiKeys(params: {
  env: Pick<CliEnv, 'get'>;
  providers: Iterable<string>;
  providedApiKey?: string;
}): Record<string, string> {
  const providers = Array.from(new Set(params.providers));
  if (providers.length === 0) {
    throw new Error('At least one provider must be specified when resolving API keys.');
  }

  // Match `resolveApiKey` semantics: an empty/whitespace --api-key value
  // falls through to env-var lookup rather than being treated as "this is
  // the key." Keeps the two resolvers consistent.
  if (params.providedApiKey) {
    if (providers.length > 1) {
      throw new Error(
        `--api-key is only valid when a single provider is active. This run uses multiple providers (${providers.join(', ')}). Provide the per-provider env vars instead: ${providers
          .map((p) => PROVIDER_ENV_VARS[p as keyof typeof PROVIDER_ENV_VARS] ?? `<${p}>`)
          .join(', ')}.`,
      );
    }
    return { [providers[0]!]: params.providedApiKey };
  }

  const resolved: Record<string, string> = {};
  const missing: Array<{ provider: string; envVar?: string }> = [];
  for (const provider of providers) {
    const providerEnvVar = PROVIDER_ENV_VARS[provider as keyof typeof PROVIDER_ENV_VARS];
    const apiKey = providerEnvVar ? params.env.get(providerEnvVar) : undefined;
    if (!apiKey) {
      missing.push({ provider, envVar: providerEnvVar });
      continue;
    }
    resolved[provider] = apiKey;
  }

  if (missing.length > 0) {
    throw new Error(buildMissingApiKeysError(missing));
  }

  return resolved;
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

function buildMissingApiKeysError(
  missing: Array<{ provider: string; envVar?: string }>,
): string {
  if (missing.length === 1) {
    const entry = missing[0]!;
    return buildMissingApiKeyError(entry.provider, entry.envVar);
  }
  const detail = missing
    .map(({ provider, envVar }) => (envVar ? `${provider} (${envVar})` : provider))
    .join(', ');
  return `API keys are required for multiple providers. Set the following env vars: ${detail}.`;
}
