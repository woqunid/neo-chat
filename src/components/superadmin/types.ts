import type { ProviderType } from "@/types";

export type AdminProvider = {
  id?: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  models: string[];
  hasApiKey?: boolean;
};
