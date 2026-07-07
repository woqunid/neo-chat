"use client";

import { Check, RefreshCw, Save, Trash2 } from "lucide-react";
import type React from "react";
import type { ProviderType } from "@/types";
import type { AdminProvider } from "./types";

const providerTypes: ProviderType[] = [
  "Gemini",
  "Anthropic",
  "OpenAI",
  "OpenAI Compatible",
];

export default function ProviderEditor({
  provider,
  modelsText,
  status,
  busy,
  onUpdate,
  onModelsTextChange,
  onFetchModels,
  onSave,
  onDelete,
}: {
  provider: AdminProvider;
  modelsText: string;
  status: string;
  busy: boolean;
  onUpdate: (updates: Partial<AdminProvider>) => void;
  onModelsTextChange: (value: string) => void;
  onFetchModels: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <section className="space-y-5 rounded-lg border border-border bg-card p-5">
      <ProviderFields provider={provider} onUpdate={onUpdate} />
      <label className="block space-y-1.5 text-sm">
        可用模型
        <textarea
          className="min-h-56 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono"
          value={modelsText}
          onChange={(event) => onModelsTextChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={busy} onClick={onFetchModels} icon="fetch">
          获取模型
        </ActionButton>
        <ActionButton disabled={busy} onClick={onSave} icon="save" primary>
          保存
        </ActionButton>
        <ActionButton disabled={busy} onClick={onDelete} icon="delete" danger>
          删除供应商
        </ActionButton>
      </div>
      {status ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check size={14} />
          {status}
        </p>
      ) : null}
    </section>
  );
}

function ProviderFields({
  provider,
  onUpdate,
}: {
  provider: AdminProvider;
  onUpdate: (updates: Partial<AdminProvider>) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField
        label="供应商名称"
        value={provider.name}
        onChange={(value) => onUpdate({ name: value })}
      />
      <label className="space-y-1.5 text-sm">
        类型
        <select
          className="w-full rounded-lg border border-input bg-background px-3 py-2"
          value={provider.type}
          onChange={(event) =>
            onUpdate({ type: event.target.value as ProviderType })
          }
        >
          {providerTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label="Base URL"
        value={provider.baseUrl}
        className="md:col-span-2"
        monospace
        onChange={(value) => onUpdate({ baseUrl: value })}
      />
      <TextField
        label="API Key"
        type="password"
        value={provider.apiKey || ""}
        placeholder={
          provider.hasApiKey ? "已保存，留空则不修改" : "输入 API Key"
        }
        className="md:col-span-2"
        monospace
        onChange={(value) => onUpdate({ apiKey: value })}
      />
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={provider.enabled}
          onChange={() => onUpdate({ enabled: !provider.enabled })}
        />
        启用给所有用户
      </label>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  className = "",
  type = "text",
  placeholder,
  monospace = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
  monospace?: boolean;
}) {
  return (
    <label className={`space-y-1.5 text-sm ${className}`}>
      {label}
      <input
        className={`w-full rounded-lg border border-input bg-background px-3 py-2 ${
          monospace ? "font-mono" : ""
        }`}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
  icon,
  primary = false,
  danger = false,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  icon: "fetch" | "save" | "delete";
  primary?: boolean;
  danger?: boolean;
}) {
  const Icon = icon === "fetch" ? RefreshCw : icon === "save" ? Save : Trash2;
  const style = primary
    ? "bg-blue-500 text-white"
    : danger
      ? "text-red-600 hover:bg-red-50"
      : "border border-blue-200 text-blue-600";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm disabled:opacity-50 ${style}`}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}
