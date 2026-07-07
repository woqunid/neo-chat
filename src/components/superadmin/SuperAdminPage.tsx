"use client";

import { useEffect, useState } from "react";
import ProviderEditor from "./ProviderEditor";
import ProviderList from "./ProviderList";
import type { AdminProvider } from "./types";

function newProvider(): AdminProvider {
  return {
    name: "New Provider",
    type: "OpenAI",
    baseUrl: "https://api.openai.com",
    apiKey: "",
    enabled: true,
    models: [],
  };
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  const data = await response.json().catch(() => null);
  return typeof data?.error === "string" ? data.error : fallback;
}

function parseModels(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeModels(models: string[]): string {
  return models.join("\n");
}

export default function SuperAdminPage() {
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modelsText, setModelsText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = providers[selectedIndex] || null;

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    setModelsText(serializeModels(selected?.models || []));
  }, [selectedIndex, selected?.id, selected?.models]);

  const loadProviders = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/superadmin/providers", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response, "加载失败"));
      const data = (await response.json()) as { providers?: AdminProvider[] };
      setProviders(data.providers || []);
      setSelectedIndex(0);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载失败");
    } finally {
      setBusy(false);
    }
  };

  const updateSelected = (updates: Partial<AdminProvider>) => {
    setProviders((current) =>
      current.map((provider, index) =>
        index === selectedIndex ? { ...provider, ...updates } : provider,
      ),
    );
  };

  const persistProviders = async (
    nextProviders: AdminProvider[],
    nextIndex: number,
    successMessage: string,
  ) => {
    setBusy(true);
    try {
      const response = await fetch("/api/superadmin/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: nextProviders }),
      });
      if (!response.ok) throw new Error(await readError(response, "保存失败"));
      const data = (await response.json()) as { providers?: AdminProvider[] };
      const savedProviders = data.providers || [];
      setProviders(savedProviders);
      setSelectedIndex(
        Math.min(nextIndex, Math.max(0, savedProviders.length - 1)),
      );
      setStatus(successMessage);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const saveProviders = async () => {
    const nextProviders = providers.map((provider, index) =>
      index === selectedIndex
        ? { ...provider, models: parseModels(modelsText) }
        : provider,
    );
    await persistProviders(nextProviders, selectedIndex, "已保存。");
  };

  const fetchModels = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch("/api/superadmin/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      if (!response.ok) throw new Error(await readError(response, "获取失败"));
      const data = (await response.json()) as { models?: string[] };
      updateSelected({ models: data.models || [] });
      setModelsText(serializeModels(data.models || []));
      setStatus("模型列表已更新，保存后对用户生效。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "获取失败");
    } finally {
      setBusy(false);
    }
  };

  const addProvider = () => {
    setProviders((current) => [...current, newProvider()]);
    setSelectedIndex(providers.length);
    setStatus("");
  };

  const deleteSelected = async () => {
    const nextProviders = providers.filter(
      (_, index) => index !== selectedIndex,
    );
    const nextIndex = Math.max(
      0,
      Math.min(selectedIndex, nextProviders.length - 1),
    );
    await persistProviders(nextProviders, nextIndex, "已删除并保存。");
  };

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl gap-5 px-5 py-6 md:grid-cols-[280px_1fr]">
        <ProviderList
          providers={providers}
          selectedIndex={selectedIndex}
          onAdd={addProvider}
          onSelect={setSelectedIndex}
        />

        {selected ? (
          <ProviderEditor
            provider={selected}
            modelsText={modelsText}
            status={status}
            busy={busy}
            onUpdate={updateSelected}
            onModelsTextChange={setModelsText}
            onFetchModels={fetchModels}
            onSave={saveProviders}
            onDelete={deleteSelected}
          />
        ) : null}
      </div>
    </main>
  );
}
