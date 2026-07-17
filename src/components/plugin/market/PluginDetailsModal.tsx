import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, RefreshCw, Save, Trash2 } from "lucide-react";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "@/lib/security/localSecrets";
import type { Plugin, PluginConfig } from "@/types";
import {
  refreshMcpPlugin,
  uninstallPlugin,
} from "@/services/api/pluginService";
import { PluginAuthPanel } from "./PluginAuthPanel";
import { PluginDetailsFrame } from "./PluginDetailsFrame";
import { PluginToolsPanel } from "./PluginToolsPanel";
import { McpSettingsPanel } from "./McpSettingsPanel";
import { McpResourcesPanel } from "./McpResourcesPanel";
import { McpPromptsPanel } from "./McpPromptsPanel";

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
  const authType = plugin.auth?.type;
  return {
    type: authType === "apiKey" || authType === "oauth2" ? authType : "bearer",
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
  const uninstall = async () => {
    if (plugin.builtIn) return;
    if (!confirming) {
      setConfirming(true);
      timer.current = setTimeout(clear, UNINSTALL_CONFIRMATION_TIMEOUT_MS);
      return;
    }
    clear();
    try {
      await uninstallPlugin(plugin.id);
      remove(plugin.id);
      onClose();
    } catch {
      setConfirming(false);
    }
  };
  return { confirming, uninstall, clear };
}

function parseMcpRoots(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const [uriValue, ...nameParts] = line.split("|");
      const uri = new URL(uriValue.trim()).toString();
      const name = nameParts.join("|").trim();
      return { uri, ...(name ? { name } : {}) };
    });
}

function usePluginConfiguration(plugin: Plugin, onClose: () => void) {
  const store = useSettingsStore();
  const config = store.pluginConfigs[plugin.id] || { disabledFunctions: [] };
  const [endpoint, setEndpoint] = useState(config.baseUrl || "");
  const [model, setModel] = useState(config.model || "");
  const [rootsText, setRootsText] = useState(
    (config.mcp?.roots || [])
      .map((root) => `${root.uri}${root.name ? ` | ${root.name}` : ""}`)
      .join("\n"),
  );
  const [refreshing, setRefreshing] = useState(false);
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
  const setTrusted = (trusted: boolean) =>
    store.updatePluginConfig(plugin.id, {
      mcp: { ...config.mcp, trusted },
    });
  const saveRoots = () =>
    store.updatePluginConfig(plugin.id, {
      mcp: { ...config.mcp, roots: parseMcpRoots(rootsText) },
    });
  const refresh = async () => {
    if (plugin.source !== "mcp" || refreshing) return;
    setRefreshing(true);
    try {
      store.upsertInstalledPlugin(await refreshMcpPlugin(plugin));
      onClose();
    } finally {
      setRefreshing(false);
    }
  };
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
    rootsText,
    setRootsText,
    setTrusted,
    saveRoots,
    refreshing,
    refresh,
  };
}

export function PluginDetailsModal({ plugin, onClose }: Props) {
  const details = usePluginConfiguration(plugin, onClose);
  const [tab, setTab] = useState<DetailsTab>("tools");
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
        ) : tab === "resources" ? (
          <McpResourcesPanel plugin={plugin} />
        ) : tab === "prompts" ? (
          <McpPromptsPanel plugin={plugin} />
        ) : (
          <>
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
            {plugin.source === "mcp" && (
              <div className="mt-4">
                <McpSettingsPanel
                  config={details.config}
                  rootsText={details.rootsText}
                  setRootsText={details.setRootsText}
                  setTrusted={details.setTrusted}
                  saveRoots={details.saveRoots}
                />
              </div>
            )}
          </>
        )}
      </div>
      <DetailsFooter
        plugin={plugin}
        confirming={uninstall.confirming}
        refreshing={details.refreshing}
        refresh={details.refresh}
        uninstall={uninstall.uninstall}
        close={close}
      />
    </PluginDetailsFrame>
  );
}

type DetailsTab = "tools" | "auth" | "resources" | "prompts";

function DetailsTabs({
  tab,
  setTab,
  plugin,
}: {
  tab: DetailsTab;
  setTab(value: DetailsTab): void;
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
      {plugin.source === "mcp" && (
        <button
          type="button"
          role="tab"
          aria-selected={tab === "resources"}
          onClick={() => setTab("resources")}
          className="mr-6 py-3"
        >
          {t("resourcesTab", {
            count:
              (plugin.mcp?.resources?.length || 0) +
              (plugin.mcp?.resourceTemplates?.length || 0),
          })}
        </button>
      )}
      {plugin.source === "mcp" && (
        <button
          type="button"
          role="tab"
          aria-selected={tab === "prompts"}
          onClick={() => setTab("prompts")}
          className="mr-6 py-3"
        >
          {t("promptsTab", { count: plugin.mcp?.prompts?.length || 0 })}
        </button>
      )}
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
  refreshing,
  refresh,
  uninstall,
  close,
}: {
  plugin: Plugin;
  confirming: boolean;
  refreshing: boolean;
  refresh(): Promise<void>;
  uninstall(): Promise<void>;
  close(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="flex justify-between border-t p-4 dark:border-border">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void uninstall()}
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
        {plugin.source === "mcp" && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="flex items-center gap-2 text-sm text-blue-600 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {t("refreshMcpCapabilities")}
          </button>
        )}
      </div>
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
