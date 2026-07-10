import "server-only";

import type {
  ServiceHealthItem,
  ServiceHealthServiceKey,
  ServiceHealthState,
  ServiceHealthStatus,
} from "@/types";
import {
  getDefaultDocumentParseProvider,
  getDefaultElevenLabsSttModel,
  getDefaultElevenLabsTtsModel,
  getDefaultMimoSttModel,
  getDefaultMimoTtsModel,
  getDefaultVoiceProvider,
  isDefaultDocumentProcessingAvailable,
} from "../defaultConfig/server";
import { getDeploymentMode } from "../security/deployment";
import { getApiProofPublicStatus } from "../security/requestProof";
import { isLocalhostName, isPrivateIpAddress } from "../security/urlPolicy";
import {
  getServerGrokSearchConfig,
  isGrokSearchReady,
} from "../search/grokRegistry";

type StoreEnvName =
  "RATE_LIMIT_STORE" | "DOCUMENT_PARSE_JOB_STORE" | "PLUGIN_REGISTRY_STORE";

const sharedStoreNames = new Set(["upstash", "redis", "kv"]);

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function envBool(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(env(name).toLowerCase());
}

function item(
  service: ServiceHealthServiceKey,
  status: ServiceHealthState,
  code: string,
  message?: string,
): ServiceHealthItem {
  return { service, status, code, ...(message ? { message } : {}) };
}

function hasSharedStoreCredentials(): boolean {
  return Boolean(
    env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN"),
  );
}

function storeHealth(
  service: Extract<
    ServiceHealthServiceKey,
    "rateLimitStore" | "documentParseJobStore" | "pluginRegistry"
  >,
  storeEnvName: StoreEnvName,
  hosted: boolean,
): ServiceHealthItem {
  const configuredStore = env(storeEnvName).toLowerCase();
  const wantsSharedStore = sharedStoreNames.has(configuredStore);

  if (wantsSharedStore && hasSharedStoreCredentials()) {
    return item(service, "available", "SHARED_STORE_CONFIGURED");
  }

  if (hosted || wantsSharedStore) {
    return item(service, "policy_blocked", "SHARED_STORE_REQUIRED");
  }

  return item(service, "local_only", "MEMORY_STORE");
}

function byokHealth(): ServiceHealthItem {
  if (env("BYOK_PRIVATE_KEY_PEM")) {
    return item("byok", "available", "STABLE_KEY_CONFIGURED");
  }
  if (envBool("BYOK_ALLOW_EPHEMERAL_KEY")) {
    return item("byok", "local_only", "EPHEMERAL_KEY_ALLOWED");
  }
  return item("byok", "missing_key", "STABLE_KEY_MISSING");
}

function apiProofHealth(): ServiceHealthItem {
  const status = getApiProofPublicStatus();
  if (!status.required) {
    return item("apiProof", "local_only", "API_PROOF_LOCAL_MODE");
  }
  if (!status.configured) {
    return item("apiProof", "missing_key", "API_PROOF_BYOK_MISSING");
  }
  return item("apiProof", "available", "API_PROOF_ENABLED");
}

function accessPasswordHealth(hosted: boolean): ServiceHealthItem {
  if (env("ACCESS_PASSWORD")) {
    return item("accessPassword", "available", "ACCESS_PASSWORD_CONFIGURED");
  }
  return item(
    "accessPassword",
    hosted ? "missing_key" : "local_only",
    hosted ? "ACCESS_PASSWORD_RECOMMENDED" : "ACCESS_PASSWORD_OPTIONAL",
  );
}

function hasPublicSiteUrl(): boolean {
  const value = env("NEXT_PUBLIC_SITE_URL");
  if (!value) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return !isLocalhostName(hostname) && !isPrivateIpAddress(hostname);
  } catch {
    return false;
  }
}

function hostedModeHealth(hosted: boolean): ServiceHealthItem {
  if (hosted) {
    return item("hostedMode", "available", "HOSTED_MODE_ENABLED");
  }

  if (hasPublicSiteUrl()) {
    return item(
      "hostedMode",
      "policy_blocked",
      "PUBLIC_LOCAL_MODE",
      "Public deployments should run with DEPLOYMENT_MODE=hosted.",
    );
  }

  return item("hostedMode", "local_only", "LOCAL_MODE");
}

function defaultModelHealth(): ServiceHealthItem {
  if (env("DEFAULT_PROVIDER_API_KEY")) {
    return item("defaultModel", "available", "DEFAULT_MODEL_CONFIGURED");
  }
  return item("defaultModel", "missing_key", "DEFAULT_PROVIDER_KEY_MISSING");
}

async function searchHealth(): Promise<ServiceHealthItem> {
  const config = await getServerGrokSearchConfig();
  if (isGrokSearchReady(config)) {
    return item("search", "available", "GROK_SEARCH_CONFIGURED");
  }
  if (config?.enabled) {
    return item("search", "missing_key", "GROK_SEARCH_CONFIG_INCOMPLETE");
  }
  return item("search", "unconfigured", "GROK_SEARCH_DISABLED");
}

function ragHealth(): ServiceHealthItem {
  const vectorStoreReady = Boolean(
    env("DEFAULT_RAG_BASE_URL") && env("DEFAULT_RAG_TOKEN"),
  );
  const parserReady = isDefaultDocumentProcessingAvailable(
    getDefaultDocumentParseProvider(),
  );

  if (vectorStoreReady || parserReady) {
    return item("rag", "available", "RAG_CONFIGURED");
  }
  return item("rag", "unconfigured", "RAG_UNCONFIGURED");
}

function voiceHealth(): ServiceHealthItem {
  const configuredProvider = env("DEFAULT_VOICE_PROVIDER").toLowerCase();
  if (!configuredProvider) {
    return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
  }
  if (configuredProvider !== "elevenlabs" && configuredProvider !== "mimo") {
    return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
  }

  const defaultProvider = getDefaultVoiceProvider();
  if (!defaultProvider) {
    return item("voice", "missing_key", "VOICE_API_KEY_MISSING");
  }

  const hasDefaultCapability =
    defaultProvider === "mimo"
      ? Boolean(getDefaultMimoSttModel() || getDefaultMimoTtsModel())
      : Boolean(
          getDefaultElevenLabsSttModel() || getDefaultElevenLabsTtsModel(),
        );

  if (hasDefaultCapability) {
    return item("voice", "available", "VOICE_CONFIGURED");
  }

  return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
}

export async function getServiceHealthStatus(
  options: { now?: number } = {},
): Promise<ServiceHealthStatus> {
  const deploymentMode = getDeploymentMode();
  const hosted = deploymentMode === "hosted";

  return {
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    deploymentMode,
    services: {
      byok: byokHealth(),
      apiProof: apiProofHealth(),
      accessPassword: accessPasswordHealth(hosted),
      hostedMode: hostedModeHealth(hosted),
      rateLimitStore: storeHealth("rateLimitStore", "RATE_LIMIT_STORE", hosted),
      documentParseJobStore: storeHealth(
        "documentParseJobStore",
        "DOCUMENT_PARSE_JOB_STORE",
        hosted,
      ),
      pluginRegistry: storeHealth(
        "pluginRegistry",
        "PLUGIN_REGISTRY_STORE",
        hosted,
      ),
      defaultModel: defaultModelHealth(),
      search: await searchHealth(),
      rag: ragHealth(),
      voice: voiceHealth(),
    },
  };
}
