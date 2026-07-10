"use client";

import { useCallback, useEffect, useState } from "react";
import { requestAdminJson } from "./adminApi";
import type { AdminProvider } from "./types";
import { useAdminRequest } from "./useAdminRequest";

const JSON_HEADERS = { "Content-Type": "application/json" };

function newProvider(): AdminProvider {
  return {
    name: "New Provider",
    type: "OpenAI Compatible",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    enabled: true,
    models: [],
  };
}

function parseModels(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProviders() {
  return requestAdminJson<{ providers?: AdminProvider[] }>(
    "/api/superadmin/providers",
    { cache: "no-store" },
    "加载失败",
  );
}

function putProviders(providers: AdminProvider[]) {
  return requestAdminJson<{ providers?: AdminProvider[] }>(
    "/api/superadmin/providers",
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ providers }),
    },
    "保存失败",
  );
}

function getProviderModels(provider: AdminProvider) {
  return requestAdminJson<{ models?: string[] }>(
    "/api/superadmin/providers/models",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ provider }),
    },
    "获取模型失败",
  );
}

function useProviderSelection() {
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modelsText, setModelsText] = useState("");
  const selected = providers[selectedIndex] || null;

  useEffect(() => {
    setModelsText((selected?.models || []).join("\n"));
  }, [selectedIndex, selected?.id, selected?.models]);

  const updateSelected = useCallback(
    (updates: Partial<AdminProvider>) => {
      setProviders((current) =>
        current.map((provider, index) =>
          index === selectedIndex ? { ...provider, ...updates } : provider,
        ),
      );
    },
    [selectedIndex],
  );

  const addProvider = useCallback(() => {
    setProviders((current) => {
      setSelectedIndex(current.length);
      return [...current, newProvider()];
    });
  }, []);

  return {
    providers,
    setProviders,
    selectedIndex,
    setSelectedIndex,
    modelsText,
    setModelsText,
    selected,
    updateSelected,
    addProvider,
  };
}

type Selection = ReturnType<typeof useProviderSelection>;
type RequestController = ReturnType<typeof useAdminRequest>;

function createProviderPersistence(
  selection: Selection,
  request: RequestController,
) {
  const persist = (values: AdminProvider[], index: number, message: string) =>
    request.run({
      request: () => putProviders(values),
      fallback: "保存失败",
      onSuccess: (data) => {
        const saved = data.providers || [];
        selection.setProviders(saved);
        selection.setSelectedIndex(
          Math.min(index, Math.max(0, saved.length - 1)),
        );
        request.setNotice({ tone: "success", message });
      },
    });

  const save = () => {
    const values = selection.providers.map((provider, index) =>
      index === selection.selectedIndex
        ? { ...provider, models: parseModels(selection.modelsText) }
        : provider,
    );
    return persist(values, selection.selectedIndex, "服务商配置已保存");
  };

  const remove = () => {
    const values = selection.providers.filter(
      (_, index) => index !== selection.selectedIndex,
    );
    const index = Math.max(
      0,
      Math.min(selection.selectedIndex, values.length - 1),
    );
    return persist(values, index, "服务商已删除");
  };

  return { save, remove };
}

function createProviderModelFetcher(
  selection: Selection,
  request: RequestController,
) {
  return () => {
    const provider = selection.selected;
    if (!provider) return;
    return request.run({
      request: () => getProviderModels(provider),
      fallback: "获取模型失败",
      onSuccess: (data) => {
        const models = data.models || [];
        selection.updateSelected({ models });
        selection.setModelsText(models.join("\n"));
        request.setNotice({
          tone: "neutral",
          message: `已获取 ${models.length} 个模型`,
        });
      },
    });
  };
}

export function useProviderAdmin() {
  const selection = useProviderSelection();
  const request = useAdminRequest();
  const { run, setNotice } = request;
  const { setProviders, setSelectedIndex } = selection;
  useEffect(() => {
    void run({
      request: getProviders,
      fallback: "加载失败",
      onSuccess: (data) => {
        setProviders(data.providers || []);
        setSelectedIndex(0);
        setNotice(null);
      },
    });
  }, [run, setNotice, setProviders, setSelectedIndex]);
  const persistence = createProviderPersistence(selection, request);
  const fetchModels = createProviderModelFetcher(selection, request);

  return {
    ...selection,
    notice: request.notice,
    busy: request.busy,
    save: persistence.save,
    deleteSelected: persistence.remove,
    fetchModels,
  };
}
