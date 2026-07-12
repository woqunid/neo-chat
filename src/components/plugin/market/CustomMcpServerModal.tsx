import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Blocks, Download, Loader2 } from "lucide-react";
import { PLUGIN_CONFIG_LIMITS } from "@/config/limits";
import { installCustomMcpServer } from "@/services/api/pluginService";
import type { Plugin } from "@/types";
import { ModalFrame } from "./ModalFrame";

interface Props {
  onClose(): void;
  onInstall(plugin: Plugin, token?: string): Promise<void> | void;
}
interface FormState {
  name: string;
  serverUrl: string;
  bearerToken: string;
}

const MCP_SERVER_NAME_MAX_CHARS = 120;

function useMcpInstall(props: Props) {
  const requestRef = useRef(0);
  const [form, setForm] = useState<FormState>({
    name: "",
    serverUrl: "",
    bearerToken: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const install = async () => {
    if (!form.name.trim() || !form.serverUrl.trim()) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const token = form.bearerToken.trim() || undefined;
      const plugin = await installCustomMcpServer({
        name: form.name,
        serverUrl: form.serverUrl,
        bearerToken: token,
      });
      if (request !== requestRef.current) return;
      await props.onInstall(plugin, token);
      if (request === requestRef.current) props.onClose();
    } catch (reason) {
      if (request === requestRef.current) setError(String(reason));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };
  return { form, update, loading, error, install };
}

export function CustomMcpServerModal(props: Props) {
  const t = useTranslations("Plugin");
  const id = useId();
  const state = useMcpInstall(props);
  return (
    <ModalFrame
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      closeLabel={t("closeCustomMcpInstaller")}
      onClose={props.onClose}
      disabled={state.loading}
    >
      <CustomMcpForm id={id} state={state} onClose={props.onClose} />
    </ModalFrame>
  );
}

function CustomMcpForm({
  id,
  state,
  onClose,
}: {
  id: string;
  state: ReturnType<typeof useMcpInstall>;
  onClose(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="space-y-4 p-6">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 text-lg font-bold"
      >
        <Blocks size={20} className="text-blue-500" />
        {t("addCustomMcpServer")}
      </h2>
      <McpFormFields id={id} state={state} />
      <p id={`${id}-description`} className="sr-only">
        {t("mcpServerUrlHint")}
      </p>
      {state.error && (
        <p role="alert" className="flex gap-2 text-xs text-red-600">
          <AlertTriangle size={14} />
          {state.error}
        </p>
      )}
      <McpActions state={state} onClose={onClose} />
    </div>
  );
}

function McpFormFields({
  id,
  state,
}: {
  id: string;
  state: ReturnType<typeof useMcpInstall>;
}) {
  const t = useTranslations("Plugin");
  return (
    <>
      <McpField
        id={`${id}-name`}
        label={t("mcpServerNameLabel")}
        value={state.form.name}
        placeholder={t("mcpServerNamePlaceholder")}
        onChange={(value) => state.update("name", value)}
        maxLength={MCP_SERVER_NAME_MAX_CHARS}
      />
      <McpField
        id={`${id}-url`}
        label={t("mcpServerUrlLabel")}
        value={state.form.serverUrl}
        placeholder={t("mcpServerUrlPlaceholder")}
        hint={t("mcpServerUrlHint")}
        onChange={(value) => state.update("serverUrl", value)}
        type="url"
        maxLength={PLUGIN_CONFIG_LIMITS.maxBaseUrlChars}
      />
      <McpField
        id={`${id}-token`}
        label={t("mcpBearerTokenLabel")}
        value={state.form.bearerToken}
        placeholder={t("mcpBearerTokenPlaceholder")}
        hint={t("mcpBearerTokenHint")}
        onChange={(value) => state.update("bearerToken", value)}
        type="password"
        maxLength={PLUGIN_CONFIG_LIMITS.maxAuthValueChars}
      />
    </>
  );
}

function McpActions({
  state,
  onClose,
}: {
  state: ReturnType<typeof useMcpInstall>;
  onClose(): void;
}) {
  const t = useTranslations("Plugin");
  const disabled =
    state.loading || !state.form.name.trim() || !state.form.serverUrl.trim();
  return (
    <div className="flex justify-end gap-3">
      <button type="button" onClick={onClose} disabled={state.loading}>
        {t("cancel")}
      </button>
      <button
        type="button"
        aria-label={t("installCustomMcpAria")}
        onClick={() => void state.install()}
        disabled={disabled}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {state.loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {t("install")}
      </button>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange(value: string): void;
  hint?: string;
  type?: string;
  maxLength: number;
}

function McpField(props: FieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="text-sm font-medium">
        {props.label}
      </label>
      <input
        id={props.id}
        type={props.type || "text"}
        value={props.value}
        maxLength={props.maxLength}
        autoComplete="off"
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-border dark:bg-muted"
      />
      {props.hint && <p className="text-[10px] text-gray-500">{props.hint}</p>}
    </div>
  );
}
