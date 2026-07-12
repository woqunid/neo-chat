import type { EncryptedSecretEnvelope } from "../byok/shared";
import type {
  ServerDefaultProviderSource,
  ServerManagedProviderSource,
} from "../defaultConfig/shared";
import {
  ANTHROPIC_PROVIDER_TYPE,
  isOpenAIProviderType,
} from "../providers/providerTypes";
import type { ProviderType } from "../../types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

export interface ProviderRuntimeConfig {
  type: ProviderType;
  source?: ServerDefaultProviderSource | ServerManagedProviderSource;
  providerId?: string;
  apiKey?: string;
  apiKeySecret?: EncryptedSecretEnvelope;
  baseUrl?: string;
  name?: string;
}

function getDefaultProviderBaseUrl(providerType: string): string {
  if (providerType === ANTHROPIC_PROVIDER_TYPE) {
    return DEFAULT_ANTHROPIC_BASE_URL;
  }
  return isOpenAIProviderType(providerType)
    ? DEFAULT_OPENAI_BASE_URL
    : DEFAULT_GEMINI_BASE_URL;
}

export function normalizeProviderBaseUrl(
  baseUrl: string | undefined,
  providerType: ProviderRuntimeConfig["type"] | string,
): string {
  if (!baseUrl || baseUrl === "default") {
    return getDefaultProviderBaseUrl(providerType);
  }
  let normalized = baseUrl.trim();
  if (normalized.endsWith("#")) normalized = normalized.slice(0, -1);
  normalized = normalized.replace(/\/+$/, "");
  if (
    isOpenAIProviderType(providerType) ||
    providerType === ANTHROPIC_PROVIDER_TYPE
  ) {
    return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
  }
  return providerType === "Gemini"
    ? normalized.replace(/\/v1beta$/, "")
    : normalized;
}

export function getProviderModelsUrl(
  baseUrl: string | undefined,
  providerType: ProviderRuntimeConfig["type"],
): string {
  const normalized = normalizeProviderBaseUrl(baseUrl, providerType);
  return providerType === "Gemini"
    ? `${normalized}/v1beta/models`
    : `${normalized}/models`;
}

export function getProviderApiKey(provider: ProviderRuntimeConfig): string {
  return provider.apiKey?.trim() || "";
}
