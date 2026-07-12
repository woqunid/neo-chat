import type { ModelMetadata, RAGConfig, VoiceSettings } from "@/types";
import type { PublicServerConfig } from "@/lib/defaultConfig/shared";
import { DEFAULT_SYSTEM_SETTINGS } from "@/config/defaults";
import { CACHE_CONFIG } from "@/config/api";
import {
  extractKnownProviderModelMetadata,
  normalizeModelMetadata,
  normalizeModelMetadataMap,
} from "@/lib/providers/metadata";
import { normalizeRAGConfig } from "../../../lib/settings/rag";
import { normalizeSystemSettings } from "../../../lib/settings/appConfig";
import {
  hasDocumentParseCredential,
  hasRagToken,
} from "../../../lib/security/localSecretResolvers";
import { readJsonResponseOrThrow } from "../../../lib/api/client";
import { logDevError } from "../../../lib/utils/devLogger";
import type { SettingsSlice, SettingsState } from "./types";

const DEFAULT_RAG: RAGConfig = {
  enabled: false,
  url: "",
  token: "",
  topK: 10,
  chunkSize: 512,
  documentParseProvider: "mineru",
  mineruApiToken: "",
  llamaParseApiKey: "",
};
const DEFAULT_VOICE: VoiceSettings = {
  sttProvider: "browser",
  sttModel: "",
  sttLanguage: "auto",
  ttsProvider: "browser",
  ttsModel: "",
  ttsVoiceId: "bIHbv24MWmeRgasZH58o",
  mimoTtsVoiceId: "mimo_default",
  ttsLanguage: "auto",
  elevenLabsApiKey: "",
  mimoApiKey: "",
  autoTranscribe: true,
};

function mergeServerModelMetadata(
  state: SettingsState,
  config: PublicServerConfig,
): Record<string, ModelMetadata> {
  const next = { ...state.customModelMetadata };
  const serverMetadata = normalizeModelMetadataMap(
    config.modelProvider.modelMetadata,
  );
  for (const [id, metadata] of Object.entries(serverMetadata)) {
    if (!next[id]) next[id] = metadata;
  }
  return next;
}

function getServerVectorDefaults(
  current: RAGConfig,
  config: PublicServerConfig,
): Partial<RAGConfig> {
  const hasLocalVector = Boolean(current.url?.trim()) || hasRagToken(current);
  if (!config.rag.vectorStoreAvailable) return {};
  if (current.useDefaultVectorStore !== undefined || hasLocalVector) return {};
  return {
    enabled: true,
    useDefaultVectorStore: true,
    topK: config.rag.topK ?? current.topK,
    chunkSize: config.rag.chunkSize ?? current.chunkSize,
    namespace: config.rag.namespace || current.namespace,
  };
}

function getServerParserDefaults(
  current: RAGConfig,
  config: PublicServerConfig,
): Partial<RAGConfig> {
  if (!config.rag.documentProcessingAvailable) return {};
  if (current.useDefaultDocumentProcessing !== undefined) return {};
  if (hasDocumentParseCredential(current)) return {};
  return {
    documentParseProvider:
      config.rag.documentProcessingProvider || current.documentParseProvider,
    useDefaultDocumentProcessing: true,
  };
}

function applyServerRag(
  current: RAGConfig,
  config: PublicServerConfig,
): RAGConfig {
  return normalizeRAGConfig({
    ...current,
    serverVectorStoreAvailable: config.rag.vectorStoreAvailable,
    serverDocumentProcessingAvailable: config.rag.documentProcessingAvailable,
    ...getServerVectorDefaults(current, config),
    ...getServerParserDefaults(current, config),
  });
}

function hasServerVoiceConfig(voice: VoiceSettings): boolean {
  return (
    voice.serverDefaultVoiceProvider !== undefined ||
    voice.serverDefaultSttAvailable !== undefined ||
    voice.serverDefaultTtsAvailable !== undefined ||
    voice.serverElevenLabsAvailable !== undefined ||
    voice.serverMimoAvailable !== undefined
  );
}

function getUnavailableVoiceFallback(
  current: VoiceSettings,
  config: PublicServerConfig,
): Partial<VoiceSettings> {
  return {
    ...(current.sttProvider === "default" && !config.voice.defaultSttAvailable
      ? { sttProvider: "browser", sttModel: "" }
      : {}),
    ...(current.ttsProvider === "default" && !config.voice.defaultTtsAvailable
      ? { ttsProvider: "browser" }
      : {}),
  };
}

function getInitialVoiceDefaults(
  current: VoiceSettings,
  config: PublicServerConfig,
): Partial<VoiceSettings> {
  if (hasServerVoiceConfig(current)) return {};
  return {
    ...(config.voice.defaultSttAvailable && current.sttProvider === "browser"
      ? { sttProvider: "default", sttModel: config.voice.sttModel || "" }
      : {}),
    ...(config.voice.defaultTtsAvailable && current.ttsProvider === "browser"
      ? getDefaultTtsSettings(config)
      : {}),
  };
}

function applyServerVoice(
  current: VoiceSettings,
  config: PublicServerConfig,
): VoiceSettings {
  return {
    ...current,
    serverDefaultVoiceProvider: config.voice.defaultProvider,
    serverDefaultSttAvailable: config.voice.defaultSttAvailable,
    serverDefaultTtsAvailable: config.voice.defaultTtsAvailable,
    serverElevenLabsAvailable: config.voice.elevenLabsAvailable,
    serverElevenLabsTtsModel:
      config.voice.defaultProvider === "elevenlabs"
        ? config.voice.ttsModel
        : undefined,
    serverMimoAvailable: config.voice.mimoAvailable,
    serverMimoSttModel: config.voice.mimoSttModel,
    serverMimoTtsModel: config.voice.mimoTtsModel,
    serverMimoTtsVoiceId: config.voice.mimoTtsVoiceId,
    ...getUnavailableVoiceFallback(current, config),
    ...getInitialVoiceDefaults(current, config),
  } as VoiceSettings;
}

function getDefaultTtsSettings(config: PublicServerConfig) {
  if (config.voice.defaultProvider === "mimo") {
    return {
      ttsProvider: "default" as const,
      mimoTtsVoiceId: config.voice.mimoTtsVoiceId || "mimo_default",
    };
  }
  return {
    ttsProvider: "default" as const,
    ...(config.voice.ttsModel ? { ttsModel: config.voice.ttsModel } : {}),
    ...(config.voice.ttsVoiceId ? { ttsVoiceId: config.voice.ttsVoiceId } : {}),
  };
}

function applyServerConfigState(
  state: SettingsState,
  config: PublicServerConfig,
): Partial<SettingsState> {
  const systemUnchanged =
    JSON.stringify(state.system) === JSON.stringify(DEFAULT_SYSTEM_SETTINGS);
  return {
    serverConfig: config,
    customModelMetadata: mergeServerModelMetadata(state, config),
    rag: applyServerRag(state.rag, config),
    voice: applyServerVoice(state.voice, config),
    ...(config.system && systemUnchanged
      ? { system: normalizeSystemSettings(config.system) }
      : {}),
  };
}

const createAppSettingsSlice: SettingsSlice = (set) => ({
  _hasHydrated: false,
  setHasHydrated: (state) => set({ _hasHydrated: state }),
  serverConfig: null,
  applyServerConfig: (config) =>
    set((state) => applyServerConfigState(state, config)),
  system: DEFAULT_SYSTEM_SETTINGS,
  updateSystemSettings: (settings) =>
    set((state) => ({
      system: normalizeSystemSettings(
        { ...state.system, ...settings },
        DEFAULT_SYSTEM_SETTINGS,
      ),
    })),
  rag: DEFAULT_RAG,
  updateRAGConfig: (config) =>
    set((state) => ({ rag: normalizeRAGConfig({ ...state.rag, ...config }) })),
  voice: DEFAULT_VOICE,
  updateVoiceSettings: (settings) =>
    set((state) => ({ voice: { ...state.voice, ...settings } })),
});

const createModelMetadataSlice: SettingsSlice = (set, get) => ({
  modelMetadata: {},
  modelMetadataTimestamp: 0,
  customModelMetadata: {},
  setCustomModelMetadata: (id, meta) =>
    set((state) => {
      const metadata = normalizeModelMetadata(meta, id);
      return metadata
        ? {
            customModelMetadata: {
              ...state.customModelMetadata,
              [metadata.id]: metadata,
            },
          }
        : state;
    }),
  fetchModelMetadata: async (forceRefresh = false) => {
    const state = get();
    const now = Date.now();
    if (
      !forceRefresh &&
      Object.keys(state.modelMetadata).length > 0 &&
      state.modelMetadataTimestamp &&
      now - state.modelMetadataTimestamp < CACHE_CONFIG.modelMetadata
    )
      return;
    try {
      const response = await fetch(
        "https://basellm.github.io/llm-metadata/api/all.json",
      );
      if (!response.ok) throw new Error("Failed to fetch model metadata");
      const data = await readJsonResponseOrThrow(
        response,
        "Failed to fetch model metadata",
      );
      set({
        modelMetadata: extractKnownProviderModelMetadata(data),
        modelMetadataTimestamp: now,
      });
    } catch (error) {
      logDevError("Error fetching model metadata:", error);
    }
  },
});

export const createCoreSettingsSlice: SettingsSlice = (set, get, store) => ({
  ...createAppSettingsSlice(set, get, store),
  ...createModelMetadataSlice(set, get, store),
});
