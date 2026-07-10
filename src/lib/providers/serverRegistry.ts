import "server-only";

import { PROVIDER_CONFIG_LIMITS } from "../../config/limits";
import type { ModelProvider, ProviderType } from "../../types";
import {
  SERVER_PROVIDER_ID_PREFIX,
  type PublicModelProviderConfig,
} from "../defaultConfig/shared";
import {
  createServerJsonStore,
  type ServerJsonStore,
} from "../serverConfig/jsonStore";
import { isProviderType } from "./providerTypes";
import { normalizeProviderModelId } from "./models";

export interface ServerModelProvider {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  models: string[];
  updatedAt: string;
}

declare global {
  var __neoChatServerModelProviders: ServerModelProvider[] | undefined;
}

const REGISTRY_KEY = "neo:server-model-providers";

function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function normalizeProviderId(value: unknown): string {
  const id = trimString(value, PROVIDER_CONFIG_LIMITS.maxProviderIdChars);
  return id.startsWith(SERVER_PROVIDER_ID_PREFIX) ? id : "";
}

function normalizeModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of value) {
    const model = normalizeProviderModelId(item);
    if (!model || seen.has(model)) continue;
    models.push(model);
    seen.add(model);
  }
  return models;
}

function normalizeServerProvider(value: unknown): ServerModelProvider | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ServerModelProvider>;
  const id = normalizeProviderId(raw.id);
  const apiKey = trimString(raw.apiKey, PROVIDER_CONFIG_LIMITS.maxApiKeyChars);
  if (!id || !apiKey || !isProviderType(raw.type)) return null;

  return {
    id,
    type: raw.type,
    apiKey,
    name:
      trimString(raw.name, PROVIDER_CONFIG_LIMITS.maxProviderNameChars) ||
      "Server Provider",
    baseUrl: trimString(raw.baseUrl, PROVIDER_CONFIG_LIMITS.maxBaseUrlChars),
    enabled: raw.enabled !== false,
    models: normalizeModels(raw.models),
    updatedAt: trimString(raw.updatedAt, 80) || new Date().toISOString(),
  };
}

function normalizeServerProviders(value: unknown): ServerModelProvider[] {
  if (!Array.isArray(value)) return [];
  const providers: ServerModelProvider[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const provider = normalizeServerProvider(item);
    if (!provider || seen.has(provider.id)) continue;
    providers.push(provider);
    seen.add(provider.id);
  }
  return providers;
}

function getMemoryProviders(): ServerModelProvider[] {
  if (!globalThis.__neoChatServerModelProviders) {
    globalThis.__neoChatServerModelProviders = [];
  }
  return globalThis.__neoChatServerModelProviders;
}

let configuredStore: ServerJsonStore<ServerModelProvider[]> | null = null;

function createStore(): ServerJsonStore<ServerModelProvider[]> {
  return createServerJsonStore({
    key: REGISTRY_KEY,
    normalize: normalizeServerProviders,
    memory: {
      read: getMemoryProviders,
      write: (providers) => {
        globalThis.__neoChatServerModelProviders = providers;
      },
      clear: () => {
        globalThis.__neoChatServerModelProviders = [];
      },
    },
  });
}

function getStore(): ServerJsonStore<ServerModelProvider[]> {
  if (!configuredStore) configuredStore = createStore();
  return configuredStore;
}

export function createServerProviderId(): string {
  return `${SERVER_PROVIDER_ID_PREFIX}${crypto.randomUUID()}`;
}

export async function listServerModelProviders(): Promise<
  ServerModelProvider[]
> {
  return normalizeServerProviders(await getStore().get());
}

export async function getServerModelProvider(
  id: string | undefined,
): Promise<ServerModelProvider | null> {
  if (!id) return null;
  const providers = await listServerModelProviders();
  return providers.find((provider) => provider.id === id) || null;
}

export async function saveServerModelProviders(
  values: ServerModelProvider[],
): Promise<ServerModelProvider[]> {
  const providers = normalizeServerProviders(values);
  await getStore().set(providers);
  globalThis.__neoChatServerModelProviders = providers;
  return providers;
}

export function toPublicModelProviderConfig(
  provider: ServerModelProvider,
): PublicModelProviderConfig {
  return {
    available: provider.enabled && provider.models.length > 0,
    id: provider.id,
    name: provider.name,
    type: provider.type,
    models: provider.models,
    modelMetadata: {},
    defaultModels: {},
  };
}

export function toPublicModelProvider(provider: ServerModelProvider) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    models: provider.models,
    hasApiKey: Boolean(provider.apiKey),
    updatedAt: provider.updatedAt,
  };
}

export function toModelProviderRuntime(
  provider: ServerModelProvider,
): Pick<ModelProvider, "type" | "name" | "baseUrl" | "apiKey"> {
  return {
    type: provider.type,
    name: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
  };
}

export function clearServerModelProvidersForTesting(): void {
  configuredStore?.clear?.();
  configuredStore = null;
  globalThis.__neoChatServerModelProviders = [];
}
