import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Save, Trash2 } from "lucide-react";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "@/lib/security/localSecrets";
import type { Plugin, PluginConfig } from "@/types";
import { PluginAuthPanel } from "./PluginAuthPanel";
import { PluginDetailsFrame } from "./PluginDetailsFrame";
import { PluginToolsPanel } from "./PluginToolsPanel";

interface Props {
  plugin: Plugin;
  onClose(): void;
}

const UNINSTALL_CONFIRMATION_TIMEOUT_MS = 5_000;

function createPluginAuth(
  plugin: Plugin,
  config: PluginConfig,
  localValueSecret?: NonNullable<PluginConfig["auth"]>["localValueSecret"],
): NonNullable<PluginConfig["auth"]> {
  return {
    type: plugin.auth?.type === "apiKey" ? "apiKey" : "bearer",
    value: "",
    ...(localValueSecret ? { localValueSecret } : {}),
    ...(config.auth?.key ? { key: config.auth.key } : {}),
    addTo: plugin.auth?.in || "header",
  };
}

function useUninstall(plugin: Plugin, onClose: () => void) {
  const remove = useSettingsStore((state) => state.removeInstalledPlugin);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setConfirming(false);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const uninstall = () => {
    if (plugin.builtIn) return;
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(clear, UNINSTALL_CONFIRMATION_TIMEOUT_MS);
      return;
    }
    clear();
    remove(plugin.id);
    onClose();
  };
  return { confirming, uninstall, clear };
}

function usePluginConfiguration(plugin: Plugin) {
  const store = useSettingsStore();
  const config = store.pluginConfigs[plugin.id] || { disabledFunctions: [] };
  const [endpoint, setEndpoint] = useState(config.baseUrl || "");
  const [model, setModel] = useState(config.model || "");
  const saveSecret = async (value: string) => {
    const localValueSecret = await encryptLocalSecret(
      value,
      LOCAL_SECRET_CONTEXTS.pluginAuth(plugin.id),
    );
    store.updatePluginConfig(plugin.id, {
      auth: createPluginAuth(plugin, config, localValueSecret),
    });
    if (!store.activePlugins.includes(plugin.id)) {
      store.togglePluginActive(plugin.id);
    }
  };
  const clearSecret = () =>
    store.updatePluginConfig(plugin.id, {
      auth: createPluginAuth(plugin, config),
    });
  const saveEndpoint = (endpointValue: string) =>
    store.updatePluginConfig(plugin.id, { baseUrl: endpointValue });
  const saveModel = (modelValue: string) =>
    store.updatePluginConfig(plugin.id, { model: modelValue });
  const toggleFunction = (name: string) =>
    store.togglePluginFunction(plugin.id, name);
  return {
    config,
    endpoint,
    model,
    setEndpoint,
    setModel,
    saveSecret,
    clearSecret,
    saveEndpoint,
    saveModel,
    toggleFunction,
  };
}

export function PluginDetailsModal({ plugin, onClose }: Props) {
  const details = usePluginConfiguration(plugin);
  const [tab, setTab] = useState<"tools" | "auth">("tools");
  const uninstall = useUninstall(plugin, onClose);
  const close = () => {
    uninstall.clear();
    onClose();
  };
  return (
    <PluginDetailsFrame plugin={plugin} onClose={close}>
      <DetailsTabs tab={tab} setTab={setTab} plugin={plugin} />
      <div className="flex-1 overflow-y-auto bg-gray-50/30 p-6 dark:bg-background/60">
        {tab === "tools" ? (
          <PluginToolsPanel
            plugin={plugin}
            disabledFunctions={details.config.disabledFunctions || []}
            onToggle={details.toggleFunction}
          />
        ) : (
          <PluginAuthPanel
            plugin={plugin}
            config={details.config}
            endpoint={details.endpoint}
            model={details.model}
            setEndpoint={details.setEndpoint}
            setModel={details.setModel}
            saveSecret={details.saveSecret}
            clearSecret={details.clearSecret}
            saveEndpoint={details.saveEndpoint}
            saveModel={details.saveModel}
          />
        )}
      </div>
      <DetailsFooter
        plugin={plugin}
        confirming={uninstall.confirming}
        uninstall={uninstall.uninstall}
        close={close}
      />
    </PluginDetailsFrame>
  );
}

function DetailsTabs({
  tab,
  setTab,
  plugin,
}: {
  tab: "tools" | "auth";
  setTab(value: "tools" | "auth"): void;
  plugin: Plugin;
}) {
  const t = useTranslations("Plugin");
  return (
    <div
      role="tablist"
      aria-label={t("detailsSectionsAria")}
      className="flex border-b px-6 dark:border-border"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === "tools"}
        onClick={() => setTab("tools")}
        className="mr-6 py-3"
      >
        {t("toolsTab", { count: plugin.functions?.length || 0 })}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "auth"}
        onClick={() => setTab("auth")}
        className="py-3"
      >
        {t("authTab")}
      </button>
    </div>
  );
}

function DetailsFooter({
  plugin,
  confirming,
  uninstall,
  close,
}: {
  plugin: Plugin;
  confirming: boolean;
  uninstall(): void;
  close(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="flex justify-between border-t p-4 dark:border-border">
      <button
        type="button"
        onClick={uninstall}
        disabled={!!plugin.builtIn}
        className="flex items-center gap-2 text-sm text-red-500 disabled:text-gray-400"
      >
        {confirming ? <Check size={16} /> : <Trash2 size={16} />}
        {plugin.builtIn
          ? t("builtIn")
          : confirming
            ? t("confirmUninstall")
            : t("uninstall")}
      </button>
      <button
        type="button"
        onClick={close}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm text-white"
      >
        <Save size={16} />
        {t("save")}
      </button>
    </div>
  );
}
