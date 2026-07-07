import { safeFetchJson } from "../security/safeFetch";
import {
  getProviderApiKey,
  getProviderModelsUrl,
  getSafeUrlPolicy,
  type ProviderRuntimeConfig,
} from "../security/urlPolicy";
import { ANTHROPIC_PROVIDER_TYPE, isOpenAIProviderType } from "./providerTypes";
import { extractProviderModelIds } from "./models";

export async function fetchProviderModelIds(
  provider: ProviderRuntimeConfig,
): Promise<{ models: string[]; status?: number; error?: string }> {
  const apiKey = getProviderApiKey(provider);
  if (!apiKey) {
    return {
      models: [],
      status: 401,
      error: `${provider.type} API key is not configured`,
    };
  }

  const endpoint = getProviderModelsUrl(provider.baseUrl, provider.type);
  const headers: Record<string, string> = {};
  if (isOpenAIProviderType(provider.type)) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider.type === ANTHROPIC_PROVIDER_TYPE) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers["x-goog-api-key"] = apiKey;
  }

  const { response, data } = await safeFetchJson<any>(
    endpoint,
    { method: "GET", headers },
    {
      policy: getSafeUrlPolicy("provider"),
      timeoutMs: 20_000,
      maxResponseBytes: 4 * 1024 * 1024,
    },
  );

  if (!response.ok) {
    return {
      models: [],
      status: response.status,
      error: `Failed to fetch ${provider.type} models`,
    };
  }

  return { models: extractProviderModelIds(provider.type, data) };
}
