import "server-only";

import {
  PROVIDER_CONFIG_LIMITS,
  PROVIDER_MODEL_LIMITS,
} from "../../config/limits";
import {
  createServerJsonStore,
  type ServerJsonStore,
} from "../serverConfig/jsonStore";

export interface ServerGrokSearchConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PublicGrokSearchConfig {
  baseUrl: string;
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
  updatedAt?: string;
}

declare global {
  var __neoChatGrokSearchConfig: ServerGrokSearchConfig | null | undefined;
}

const REGISTRY_KEY = "neo:grok-search-config";
let configuredStore: ServerJsonStore<ServerGrokSearchConfig | null> | null =
  null;

function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function normalizeConfig(value: unknown): ServerGrokSearchConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ServerGrokSearchConfig>;
  return {
    baseUrl: trimString(raw.baseUrl, PROVIDER_CONFIG_LIMITS.maxBaseUrlChars),
    apiKey: trimString(raw.apiKey, PROVIDER_CONFIG_LIMITS.maxApiKeyChars),
    model: trimString(raw.model, PROVIDER_MODEL_LIMITS.maxModelIdChars),
    enabled: raw.enabled === true,
    updatedAt: trimString(raw.updatedAt, 80) || new Date().toISOString(),
  };
}

function readMemoryConfig(): ServerGrokSearchConfig | null {
  return globalThis.__neoChatGrokSearchConfig ?? null;
}

function createStore(): ServerJsonStore<ServerGrokSearchConfig | null> {
  return createServerJsonStore({
    key: REGISTRY_KEY,
    normalize: normalizeConfig,
    memory: {
      read: readMemoryConfig,
      write: (config) => {
        globalThis.__neoChatGrokSearchConfig = config;
      },
      clear: () => {
        globalThis.__neoChatGrokSearchConfig = null;
      },
    },
  });
}

function getStore(): ServerJsonStore<ServerGrokSearchConfig | null> {
  if (!configuredStore) configuredStore = createStore();
  return configuredStore;
}

export function isGrokSearchReady(
  config: ServerGrokSearchConfig | null,
): config is ServerGrokSearchConfig & { enabled: true } {
  return Boolean(
    config?.enabled && config.baseUrl && config.apiKey && config.model,
  );
}

export async function getServerGrokSearchConfig(): Promise<ServerGrokSearchConfig | null> {
  return normalizeConfig(await getStore().get());
}

export async function saveServerGrokSearchConfig(
  value: ServerGrokSearchConfig,
): Promise<ServerGrokSearchConfig> {
  const config = normalizeConfig(value);
  if (!config) throw new Error("Invalid Grok search configuration");
  await getStore().set(config);
  globalThis.__neoChatGrokSearchConfig = config;
  return config;
}

export function toPublicGrokSearchConfig(
  config: ServerGrokSearchConfig | null,
): PublicGrokSearchConfig {
  return {
    baseUrl: config?.baseUrl || "",
    model: config?.model || "",
    enabled: config?.enabled === true,
    hasApiKey: Boolean(config?.apiKey),
    ...(config?.updatedAt ? { updatedAt: config.updatedAt } : {}),
  };
}

export function clearServerGrokSearchConfigForTesting(): void {
  configuredStore?.clear?.();
  configuredStore = null;
  globalThis.__neoChatGrokSearchConfig = null;
}
