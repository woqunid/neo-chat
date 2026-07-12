import { useId } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, KeyRound, Settings, ShieldAlert } from "lucide-react";
import { PLUGIN_CONFIG_LIMITS } from "@/config/limits";
import { SecretInput } from "@/components/settings/SettingsUI";
import { hasPluginAuthValue } from "@/lib/security/localSecretResolvers";
import type { Plugin, PluginConfig } from "@/types";
import {
  ENDPOINT_CONFIG_PLUGIN_IDS,
  getEndpointPlaceholder,
  getModelPlaceholder,
  MODEL_CONFIG_PLUGIN_IDS,
} from "./utils";

interface Props {
  plugin: Plugin;
  config: PluginConfig;
  endpoint: string;
  model: string;
  setEndpoint(value: string): void;
  setModel(value: string): void;
  saveSecret(value: string): Promise<void>;
  clearSecret(): void;
  saveEndpoint(value: string): void;
  saveModel(value: string): void;
}

export function PluginAuthPanel(props: Props) {
  const t = useTranslations("Plugin");
  return (
    <div className="space-y-4" role="tabpanel">
      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-200">
        <ShieldAlert size={20} className="shrink-0" />
        <div>
          <strong>{t("localStorageOnly")}</strong>
          <p>{t("authStorageDesc")}</p>
        </div>
      </div>
      {props.plugin.auth?.type === "none" ? (
        <p className="py-4 text-center text-sm text-gray-500">
          {t("noAuthRequired")}
        </p>
      ) : (
        <AuthSecret {...props} />
      )}
      {ENDPOINT_CONFIG_PLUGIN_IDS.has(props.plugin.id) && (
        <EndpointField {...props} />
      )}
      {MODEL_CONFIG_PLUGIN_IDS.has(props.plugin.id) && (
        <ModelField {...props} />
      )}
    </div>
  );
}

function AuthSecret(props: Props) {
  const t = useTranslations("Plugin");
  const id = useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm font-medium"
      >
        <KeyRound size={16} />
        {t("apiKeyLabel")}
      </label>
      <SecretInput
        id={id}
        name={`${props.plugin.id}-auth-token`}
        maxLength={PLUGIN_CONFIG_LIMITS.maxAuthValueChars}
        placeholder={t("authPlaceholder")}
        hasSecret={hasPluginAuthValue(props.config.auth)}
        onSave={props.saveSecret}
        onClear={props.clearSecret}
        inputClassName="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm dark:border-border dark:bg-muted"
      />
    </div>
  );
}

function EndpointField(props: Props) {
  const t = useTranslations("Plugin");
  return (
    <ConfigField
      label={t("endpointLabel")}
      icon={<ExternalLink size={16} />}
      value={props.endpoint}
      placeholder={getEndpointPlaceholder(
        props.plugin.id,
        t("endpointPlaceholder"),
      )}
      maxLength={PLUGIN_CONFIG_LIMITS.maxBaseUrlChars}
      onChange={props.setEndpoint}
      onSave={props.saveEndpoint}
      clearLabel={t("clearEndpoint")}
      hint={t("endpointHint")}
    />
  );
}

function ModelField(props: Props) {
  const t = useTranslations("Plugin");
  return (
    <ConfigField
      label={t("modelLabel")}
      icon={<Settings size={16} />}
      value={props.model}
      placeholder={getModelPlaceholder(props.plugin.id, t("modelPlaceholder"))}
      maxLength={PLUGIN_CONFIG_LIMITS.maxModelNameChars}
      onChange={props.setModel}
      onSave={props.saveModel}
      clearLabel={t("clearModel")}
      hint={t("modelHint")}
    />
  );
}

interface ConfigFieldProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  placeholder: string;
  maxLength: number;
  onChange(value: string): void;
  onSave(value: string): void;
  clearLabel: string;
  hint: string;
}

function ConfigField(props: ConfigFieldProps) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-sm font-medium"
      >
        {props.icon}
        {props.label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={props.value}
          maxLength={props.maxLength}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.target.value)}
          onBlur={() => props.onSave(props.value)}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-border dark:bg-muted"
        />
        <button
          type="button"
          onClick={() => {
            props.onChange("");
            props.onSave("");
          }}
          disabled={!props.value}
        >
          {props.clearLabel}
        </button>
      </div>
      <p className="text-xs text-gray-500">{props.hint}</p>
    </div>
  );
}
