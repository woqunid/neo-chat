"use client";

import { RefreshCw, Save, Trash2 } from "lucide-react";
import type { ProviderType } from "@/types";
import {
  AdminActionButton,
  AdminNoticeText,
  AdminTextField,
  AdminToggle,
} from "./AdminFormControls";
import type { AdminNotice, AdminProvider } from "./types";

const PROVIDER_TYPES: ProviderType[] = [
  "Gemini",
  "Anthropic",
  "OpenAI",
  "OpenAI Compatible",
];

interface ProviderEditorProps {
  provider: AdminProvider;
  modelsText: string;
  notice: AdminNotice | null;
  busy: boolean;
  onUpdate: (updates: Partial<AdminProvider>) => void;
  onModelsTextChange: (value: string) => void;
  onFetchModels: () => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function ProviderEditor(props: ProviderEditorProps) {
  return (
    <section className="min-w-0">
      <ProviderHeader provider={props.provider} />
      <div className="space-y-7 p-5 md:p-6">
        <ProviderFields provider={props.provider} onUpdate={props.onUpdate} />
        <ModelListField
          value={props.modelsText}
          onChange={props.onModelsTextChange}
        />
      </div>
      <ProviderFooter {...props} />
    </section>
  );
}

function ProviderHeader({ provider }: { provider: AdminProvider }) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-4 border-b border-border px-5 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">{provider.name}</h2>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {provider.baseUrl || "Base URL 未设置"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`h-2 w-2 rounded-full ${
            provider.enabled ? "bg-emerald-500" : "bg-zinc-400"
          }`}
        />
        {provider.enabled ? "已启用" : "未启用"}
      </div>
    </header>
  );
}

function ProviderFields({
  provider,
  onUpdate,
}: Pick<ProviderEditorProps, "provider" | "onUpdate">) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <AdminTextField
        label="供应商名称"
        value={provider.name}
        onChange={(name) => onUpdate({ name })}
      />
      <ProviderTypeField provider={provider} onUpdate={onUpdate} />
      <AdminTextField
        label="Base URL"
        value={provider.baseUrl}
        className="md:col-span-2"
        monospace
        onChange={(baseUrl) => onUpdate({ baseUrl })}
      />
      <AdminTextField
        label="API Key"
        type="password"
        value={provider.apiKey || ""}
        placeholder={
          provider.hasApiKey ? "已保存，留空则不修改" : "输入 API Key"
        }
        className="md:col-span-2"
        monospace
        onChange={(apiKey) => onUpdate({ apiKey })}
      />
      <div className="md:col-span-2">
        <AdminToggle
          label="对所有用户启用"
          checked={provider.enabled}
          onChange={() => onUpdate({ enabled: !provider.enabled })}
        />
      </div>
    </div>
  );
}

function ProviderTypeField({
  provider,
  onUpdate,
}: Pick<ProviderEditorProps, "provider" | "onUpdate">) {
  return (
    <label className="space-y-2 text-sm font-medium">
      类型
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={provider.type}
        onChange={(event) =>
          onUpdate({ type: event.target.value as ProviderType })
        }
      >
        {PROVIDER_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModelListField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      可用模型
      <textarea
        className="min-h-52 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
        value={value}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ProviderFooter(props: ProviderEditorProps) {
  return (
    <footer className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
      <AdminNoticeText notice={props.notice} />
      <div className="flex flex-wrap justify-end gap-2">
        <AdminActionButton
          disabled={props.busy}
          onClick={props.onFetchModels}
          icon={RefreshCw}
        >
          获取模型
        </AdminActionButton>
        <AdminActionButton
          disabled={props.busy}
          onClick={props.onDelete}
          icon={Trash2}
          tone="danger"
        >
          删除
        </AdminActionButton>
        <AdminActionButton
          disabled={props.busy}
          onClick={props.onSave}
          icon={Save}
          tone="primary"
        >
          保存
        </AdminActionButton>
      </div>
    </footer>
  );
}
