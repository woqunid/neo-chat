import "server-only";

import { PROVIDER_CONFIG_LIMITS } from "../../config/limits";
import type { ModelProvider, ProviderType } from "../../types";
import {
  SERVER_PROVIDER_ID_PREFIX,
  type PublicModelProviderConfig,
} from "../defaultConfig/shared";
import { getDeploymentMode } from "../security/deployment";
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

interface ServerModelProviderStore {
  getAll(): Promise<ServerModelProvider[]>;
  setAll(providers: ServerModelProvider[]): Promise<void>;
  clear?(): void;
}

declare global {
  var __neoChatServerModelProviders: ServerModelProvider[] | undefined;
}

const REGISTRY_KEY = "neo:server-model-providers";
const SHARED_PROVIDER_STORE_ERROR =
  "MODEL_PROVIDER_STORE=upstash with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN is required in hosted mode";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isSharedStoreName(store: string): boolean {
  return store === "upstash" || store === "redis" || store === "kv";
}

function canUseMemoryStore(): boolean {
  return getDeploymentMode() === "local";
}

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

class UpstashServerModelProviderStore implements ServerModelProviderStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}/${path}`;
  }

  async getAll(): Promise<ServerModelProvider[]> {
    const response = await fetch(
      this.endpoint(`get/${encodeURIComponent(REGISTRY_KEY)}`),
      { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Provider store failed with status ${response.status}`);
    }
    const data = (await response.json()) as { result?: string | null };
    return normalizeServerProviders(data.result ? JSON.parse(data.result) : []);
  }

  async setAll(providers: ServerModelProvider[]): Promise<void> {
    const response = await fetch(this.endpoint("set"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([REGISTRY_KEY, JSON.stringify(providers)]),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Provider store failed with status ${response.status}`);
    }
  }
}

let configuredStore: ServerModelProviderStore | null = null;

function createStore(): ServerModelProviderStore {
  const store = env("MODEL_PROVIDER_STORE").toLowerCase();
  const upstashUrl = env("UPSTASH_REDIS_REST_URL");
  const upstashToken = env("UPSTASH_REDIS_REST_TOKEN");
  if (isSharedStoreName(store) && upstashUrl && upstashToken) {
    return new UpstashServerModelProviderStore(upstashUrl, upstashToken);
  }
  if (isSharedStoreName(store) || getDeploymentMode() === "hosted") {
    throw new Error(SHARED_PROVIDER_STORE_ERROR);
  }
  return {
    async getAll() {
      return getMemoryProviders();
    },
    async setAll(providers) {
      globalThis.__neoChatServerModelProviders = providers;
    },
    clear() {
      globalThis.__neoChatServerModelProviders = [];
    },
  };
}

function getStore(): ServerModelProviderStore {
  if (!configuredStore) configuredStore = createStore();
  return configuredStore;
}

export function createServerProviderId(): string {
  return `${SERVER_PROVIDER_ID_PREFIX}${crypto.randomUUID()}`;
}

export async function listServerModelProviders(): Promise<
  ServerModelProvider[]
> {
  return normalizeServerProviders(await getStore().getAll());
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
  await getStore().setAll(providers);
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
