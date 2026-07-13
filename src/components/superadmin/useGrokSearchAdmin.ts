"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { requestAdminJson } from "./adminApi";
import type { AdminGrokSearchConfig } from "./types";
import { useAdminRequest } from "./useAdminRequest";

const JSON_HEADERS = { "Content-Type": "application/json" };
const EMPTY_CONFIG: AdminGrokSearchConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  hasApiKey: false,
};

function buildPayload(config: AdminGrokSearchConfig) {
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    ...(config.apiKey?.trim() ? { apiKey: config.apiKey.trim() } : {}),
  };
}

function getConfig() {
  return requestAdminJson<{ config?: AdminGrokSearchConfig }>(
    "/api/superadmin/grok-search",
    { cache: "no-store" },
    "加载失败",
  );
}

function saveConfig(config: AdminGrokSearchConfig) {
  return requestAdminJson<{ config: AdminGrokSearchConfig }>(
    "/api/superadmin/grok-search",
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload(config)),
    },
    "保存失败",
  );
}

function postConfig<T>(
  path: string,
  config: AdminGrokSearchConfig,
  fallback: string,
) {
  return requestAdminJson<T>(
    path,
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ config: buildPayload(config) }),
    },
    fallback,
  );
}

type ConfigSetter = Dispatch<SetStateAction<AdminGrokSearchConfig>>;
type ModelsSetter = Dispatch<SetStateAction<string[]>>;
type RequestController = ReturnType<typeof useAdminRequest>;
type RequestRunner = RequestController["run"];
type NoticeSetter = RequestController["setNotice"];

function useConfigLoader(
  setConfig: ConfigSetter,
  run: RequestRunner,
  setNotice: NoticeSetter,
) {
  useEffect(() => {
    void run({
      request: getConfig,
      fallback: "加载失败",
      onSuccess: (data) => {
        setConfig({ ...EMPTY_CONFIG, ...data.config, apiKey: "" });
        setNotice(null);
      },
    });
  }, [run, setConfig, setNotice]);
}

function createSaveAction(
  config: AdminGrokSearchConfig,
  setConfig: ConfigSetter,
  request: RequestController,
) {
  return () =>
    request.run({
      request: () => saveConfig(config),
      fallback: "保存失败",
      onSuccess: (data) => {
        setConfig({ ...EMPTY_CONFIG, ...data.config, apiKey: "" });
        request.setNotice({
          tone: "success",
          message: "Grok 联网配置已保存",
        });
      },
    });
}

function createFetchModelsAction(
  config: AdminGrokSearchConfig,
  setModels: ModelsSetter,
  request: RequestController,
) {
  return () =>
    request.run({
      request: () =>
        postConfig<{ models?: string[] }>(
          "/api/superadmin/grok-search/models",
          config,
          "获取模型失败",
        ),
      fallback: "获取模型失败",
      onSuccess: (data) => {
        const models = data.models || [];
        setModels(models);
        request.setNotice({
          tone: "neutral",
          message: `已获取 ${models.length} 个模型`,
        });
      },
    });
}

function createTestAction(
  config: AdminGrokSearchConfig,
  request: RequestController,
) {
  return () =>
    request.run({
      request: () =>
        postConfig<{ citationCount?: number }>(
          "/api/superadmin/grok-search/test",
          config,
          "联网测试失败",
        ),
      fallback: "联网测试失败",
      onSuccess: (data) => {
        const count = data.citationCount || 0;
        request.setNotice({
          tone: "success",
          message: `联网测试成功，返回 ${count} 条引用`,
        });
      },
    });
}

export function useGrokSearchAdmin() {
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [models, setModels] = useState<string[]>([]);
  const request = useAdminRequest();
  useConfigLoader(setConfig, request.run, request.setNotice);
  const save = createSaveAction(config, setConfig, request);
  const fetchModels = createFetchModelsAction(config, setModels, request);
  const test = createTestAction(config, request);

  return {
    config,
    setConfig,
    models,
    notice: request.notice,
    busy: request.busy,
    save,
    fetchModels,
    test,
  };
}
