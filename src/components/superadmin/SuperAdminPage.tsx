"use client";

import { useEffect, useState } from "react";
import PasswordGate from "./PasswordGate";
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
  const [password, setPassword] = useState("");
  const [verified, setVerified] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [providers, setProviders] = useState<AdminProvider[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modelsText, setModelsText] = useState("");
  const [status, setStatus] = useState("正在检查管理员会话…");
  const [busy, setBusy] = useState(false);

  const selected = providers[selectedIndex] || null;
  const canSubmitPassword = password.trim().length > 0 && !busy;

  useEffect(() => {
    fetch("/api/superadmin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setConfigured(Boolean(data.enabled));
        setVerified(Boolean(data.verified));
        setStatus(data.enabled ? "" : "未配置 PROVIDER_ADMIN_PASSWORD。");
      })
      .catch(() => setStatus("管理员会话检查失败。"));
  }, []);

  useEffect(() => {
    if (!verified) return;
    void loadProviders();
  }, [verified]);

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
      setProviders(data.providers?.length ? data.providers : [newProvider()]);
      setSelectedIndex(0);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载失败");
    } finally {
      setBusy(false);
    }
  };

  const verifyPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitPassword) return;
    setBusy(true);
    try {
      const response = await fetch("/api/superadmin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error(await readError(response, "验证失败"));
      setPassword("");
      setVerified(true);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "验证失败");
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

  const saveProviders = async () => {
    const nextProviders = providers.map((provider, index) =>
      index === selectedIndex
        ? { ...provider, models: parseModels(modelsText) }
        : provider,
    );
    setBusy(true);
    try {
      const response = await fetch("/api/superadmin/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers: nextProviders }),
      });
      if (!response.ok) throw new Error(await readError(response, "保存失败"));
      const data = (await response.json()) as { providers?: AdminProvider[] };
      setProviders(data.providers || []);
      setStatus("已保存。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
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

  const deleteSelected = () => {
    setProviders((current) =>
      current.filter((_, index) => index !== selectedIndex),
    );
    setSelectedIndex(0);
    setStatus("已从列表移除，保存后生效。");
  };

  if (!configured || !verified) {
    return (
      <PasswordGate
        password={password}
        status={status}
        busy={busy}
        configured={configured}
        canSubmit={canSubmitPassword}
        onPasswordChange={setPassword}
        onSubmit={verifyPassword}
      />
    );
  }

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
