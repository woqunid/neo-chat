"use client";

import { FlaskConical, RefreshCw, Save } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  AdminActionButton,
  AdminNoticeText,
  AdminTextField,
  AdminToggle,
} from "./AdminFormControls";
import type { AdminGrokSearchConfig, AdminNotice } from "./types";
import { useGrokSearchAdmin } from "./useGrokSearchAdmin";

export default function GrokSearchEditor() {
  const admin = useGrokSearchAdmin();
  const ready = Boolean(
    admin.config.baseUrl &&
    admin.config.model &&
    (admin.config.apiKey || admin.config.hasApiKey),
  );

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <GrokHeader enabled={admin.config.enabled} ready={ready} />
      <GrokFields
        config={admin.config}
        models={admin.models}
        onChange={admin.setConfig}
      />
      <GrokFooter
        busy={admin.busy}
        canConnect={ready}
        notice={admin.notice}
        onFetchModels={admin.fetchModels}
        onTest={admin.test}
        onSave={admin.save}
      />
    </section>
  );
}

function GrokHeader({ enabled, ready }: { enabled: boolean; ready: boolean }) {
  const status = enabled && ready ? "可用" : enabled ? "配置不完整" : "未启用";
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 md:px-6">
      <div>
        <h2 className="text-sm font-semibold">Grok 联网搜索</h2>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          Responses API · web_search
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-2 w-2 rounded-full ${
            enabled && ready ? "bg-emerald-500" : "bg-zinc-400"
          }`}
        />
        {status}
      </div>
    </header>
  );
}

function GrokFields({
  config,
  models,
  onChange,
}: {
  config: AdminGrokSearchConfig;
  models: string[];
  onChange: Dispatch<SetStateAction<AdminGrokSearchConfig>>;
}) {
  return (
    <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
      <AdminTextField
        label="Base URL"
        value={config.baseUrl}
        placeholder="https://api.example.com/v1"
        className="md:col-span-2"
        type="url"
        monospace
        onChange={(baseUrl) => onChange((current) => ({ ...current, baseUrl }))}
      />
      <AdminTextField
        label="API Key"
        value={config.apiKey || ""}
        placeholder={config.hasApiKey ? "已保存，留空则不修改" : "输入 API Key"}
        type="password"
        monospace
        onChange={(apiKey) => onChange((current) => ({ ...current, apiKey }))}
      />
      <AdminTextField
        label="模型"
        value={config.model}
        placeholder="grok-4"
        list="grok-search-models"
        monospace
        onChange={(model) => onChange((current) => ({ ...current, model }))}
      />
      <datalist id="grok-search-models">
        {models.map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      <div className="md:col-span-2">
        <AdminToggle
          label="对所有用户启用"
          checked={config.enabled}
          onChange={() =>
            onChange((current) => ({ ...current, enabled: !current.enabled }))
          }
        />
      </div>
    </div>
  );
}

function GrokFooter({
  busy,
  canConnect,
  notice,
  onFetchModels,
  onTest,
  onSave,
}: {
  busy: boolean;
  canConnect: boolean;
  notice: AdminNotice | null;
  onFetchModels: () => void;
  onTest: () => void;
  onSave: () => void;
}) {
  return (
    <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
      <AdminNoticeText notice={notice} />
      <div className="flex flex-wrap justify-end gap-2">
        <AdminActionButton
          icon={RefreshCw}
          disabled={busy || !canConnect}
          onClick={onFetchModels}
        >
          获取模型
        </AdminActionButton>
        <AdminActionButton
          icon={FlaskConical}
          disabled={busy || !canConnect}
          onClick={onTest}
        >
          测试联网
        </AdminActionButton>
        <AdminActionButton
          icon={Save}
          disabled={busy}
          onClick={onSave}
          tone="primary"
        >
          保存配置
        </AdminActionButton>
      </div>
    </footer>
  );
}
