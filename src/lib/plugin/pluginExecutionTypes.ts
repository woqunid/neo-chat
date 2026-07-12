import type { EncryptedSecretEnvelope } from "../byok/shared";

export interface PluginAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  valueSecret?: EncryptedSecretEnvelope;
  key?: string;
  addTo?: "header" | "query";
  baseUrl?: string;
  model?: string;
}

export type PluginHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
