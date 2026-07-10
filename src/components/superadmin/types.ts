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

export type AdminGrokSearchConfig = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  enabled: boolean;
  hasApiKey?: boolean;
  updatedAt?: string;
};

export type AdminNotice = {
  tone: "success" | "error" | "neutral";
  message: string;
};

export type SuperAdminSection = "providers" | "grok-search";
