"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "@/lib/byok/client";
import {
  PublicServerConfig,
  SERVER_DEFAULT_PROVIDER_ID,
} from "@/lib/defaultConfig/shared";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "@/lib/api/client";
import { shouldResolveSelectedModelAfterBootstrap } from "@/lib/app/startupEffects";
import { logDevError } from "@/lib/utils/devLogger";
import { buildAvailableModels, resolveSelectedModel } from "@/lib/utils/models";
import type { ModelInfo } from "@/services/api/chatService";
import { formatModelName } from "@/store/core/settingsStore";

import type { ChatShellState } from "../runtimeTypes";

interface ServerConfigActions {
  applyCore: (config: PublicServerConfig) => void;
  applySettings: (config: PublicServerConfig) => void;
}

async function fetchServerConfig(): Promise<PublicServerConfig> {
  const response = await fetch("/api/config", {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Failed to load config"),
    );
  }
  return readJsonResponseOrThrow(response, "Failed to load config");
}

function useServerConfig(shell: ChatShellState, actions: ServerConfigActions) {
  const [resolved, setResolved] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const canLoad = shell.core._hasHydrated && shell.settings._hasHydrated;

  useEffect(() => {
    if (!canLoad) return;
    let active = true;
    setResolved(false);
    setModelsReady(false);
    fetchServerConfig()
      .then((config) => {
        if (!active) return;
        actions.applyCore(config);
        actions.applySettings(config);
        setResolved(true);
        setModelsReady(
          !config.modelProvider.available ||
            config.modelProvider.models.length > 0,
        );
      })
      .catch((error) => {
        logDevError("Failed to load server config", error);
        if (!active) return;
        setResolved(true);
        setModelsReady(true);
      });
    return () => {
      active = false;
    };
  }, [actions, canLoad]);

  return { resolved, modelsReady, setModelsReady };
}

function findDefaultProvider(shell: ChatShellState) {
  return shell.core.providers.find(
    (provider) =>
      provider.id === SERVER_DEFAULT_PROVIDER_ID && provider.isServerDefault,
  );
}

async function fetchDefaultProviderModels(
  provider: NonNullable<ReturnType<typeof findDefaultProvider>>,
) {
  const response = await fetchWithByokRetry(async () =>
    signedApiFetch("/api/providers/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(provider),
      }),
    }),
  );
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Failed to fetch models"),
    );
  }
  return readJsonResponseOrThrow<{ models?: string[] }>(
    response,
    "Failed to fetch models",
  );
}

function useDefaultProviderModels(
  shell: ChatShellState,
  config: ReturnType<typeof useServerConfig>,
) {
  const fetchStartedRef = useRef(false);
  const provider = findDefaultProvider(shell);
  const shouldFetch =
    shell.core._hasHydrated && config.resolved && !config.modelsReady;

  const setModelsReady = config.setModelsReady;
  const updateProvider = shell.core.updateProvider;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!provider || provider.modelsList?.length || provider.models.length) {
      setModelsReady(true);
      return;
    }
    if (fetchStartedRef.current) return;
    let active = true;
    fetchStartedRef.current = true;
    fetchDefaultProviderModels(provider)
      .then(({ models = [] }) => {
        updateProvider(provider.id, { models, modelsList: models });
        if (active) setModelsReady(true);
      })
      .catch((error) => {
        logDevError("Failed to fetch default provider models", error);
        if (active) setModelsReady(true);
      });
    return () => {
      active = false;
    };
  }, [provider, setModelsReady, shouldFetch, updateProvider]);

  useEffect(() => {
    if (!config.resolved) fetchStartedRef.current = false;
  }, [config.resolved]);
}

function useSelectedModelResolution(
  shell: ChatShellState,
  availableModels: ModelInfo[],
  modelsReady: boolean,
) {
  const chatHydrated = shell.chat._hasHydrated;
  const settingsHydrated = shell.settings._hasHydrated;
  const coreHydrated = shell.core._hasHydrated;
  const selectedModel = shell.chat.selectedModel;
  const setModel = shell.chat.setModel;
  useEffect(() => {
    const ready = shouldResolveSelectedModelAfterBootstrap({
      chatHydrated,
      settingsHydrated,
      coreHydrated,
      serverModelBootstrapReady: modelsReady,
    });
    if (!ready) return;
    const nextModel = resolveSelectedModel(
      availableModels,
      selectedModel,
      SERVER_DEFAULT_PROVIDER_ID,
    );
    if (selectedModel !== nextModel) setModel(nextModel);
  }, [
    availableModels,
    chatHydrated,
    coreHydrated,
    modelsReady,
    selectedModel,
    setModel,
    settingsHydrated,
  ]);
}

export function useChatModelBootstrap(shell: ChatShellState): ModelInfo[] {
  const {
    _hasHydrated: settingsHydrated,
    customModelMetadata,
    modelMetadata,
  } = shell.settings;
  const { _hasHydrated: coreHydrated, providers } = shell.core;
  const availableModels = useMemo(() => {
    if (!settingsHydrated || !coreHydrated) return [];
    return buildAvailableModels(
      providers,
      modelMetadata,
      customModelMetadata,
      formatModelName,
    );
  }, [
    coreHydrated,
    customModelMetadata,
    modelMetadata,
    providers,
    settingsHydrated,
  ]);
  const actions = useMemo(
    () => ({
      applyCore: shell.core.applyServerConfig,
      applySettings: shell.settings.applyServerConfig,
    }),
    [shell.core.applyServerConfig, shell.settings.applyServerConfig],
  );
  const config = useServerConfig(shell, actions);
  useDefaultProviderModels(shell, config);
  useSelectedModelResolution(shell, availableModels, config.modelsReady);
  return availableModels;
}
