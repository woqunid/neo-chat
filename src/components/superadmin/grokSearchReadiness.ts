import type { AdminGrokSearchConfig } from "./types";

export interface GrokSearchReadiness {
  readonly canFetchModels: boolean;
  readonly canTestConnection: boolean;
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

export function getGrokSearchReadiness(
  config: AdminGrokSearchConfig,
): GrokSearchReadiness {
  const hasApiKey = hasText(config.apiKey) || Boolean(config.hasApiKey);
  const canFetchModels = hasText(config.baseUrl) && hasApiKey;
  return {
    canFetchModels,
    canTestConnection: canFetchModels && hasText(config.model),
  };
}
