import { useCallback, useRef, useState } from "react";
import { installPlugin } from "@/services/api/pluginService";
import {
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "@/lib/security/localSecrets";
import type { Plugin } from "@/types";
import type { useSettingsStore } from "@/store/core/settingsStore";

type SettingsStore = ReturnType<typeof useSettingsStore.getState>;

function useMarketplaceInstall(store: SettingsStore, installFailed: string) {
  const pending = useRef(new Set<string>());
  const [installingIds, setInstallingIds] = useState<string[]>([]);
  const [installError, setInstallError] = useState<string | null>(null);
  const install = useCallback(
    async (plugin: Plugin) => {
      if (pending.current.has(plugin.id)) return;
      pending.current.add(plugin.id);
      setInstallingIds(Array.from(pending.current));
      setInstallError(null);
      try {
        const credential =
          plugin.source === "mcp" &&
          plugin.auth?.type !== "none" &&
          plugin.auth?.required !== false
            ? window.prompt(
                `MCP 服务“${plugin.title}”需要在安装前完成鉴权，请输入访问凭据：`,
              )
            : undefined;
        if (credential === null) return;
        store.upsertInstalledPlugin(await installPlugin(plugin, credential));
      } catch (reason) {
        setInstallError(
          reason instanceof Error ? reason.message : installFailed,
        );
      } finally {
        pending.current.delete(plugin.id);
        setInstallingIds(Array.from(pending.current));
      }
    },
    [installFailed, store],
  );
  return { installingIds, install, installError };
}

function useCustomMcpInstall(store: SettingsStore) {
  return useCallback(
    async (plugin: Plugin, credential?: string) => {
      const value = credential?.trim();
      const secret = value
        ? await encryptLocalSecret(
            value,
            LOCAL_SECRET_CONTEXTS.pluginAuth(plugin.id),
          )
        : undefined;
      store.upsertInstalledPlugin(plugin);
      if (secret) {
        store.updatePluginConfig(plugin.id, {
          auth: {
            type:
              plugin.auth?.type === "apiKey" || plugin.auth?.type === "oauth2"
                ? plugin.auth.type
                : "bearer",
            value: "",
            localValueSecret: secret,
            key: plugin.auth?.name || "Authorization",
            addTo: plugin.auth?.in || "header",
          },
        });
      }
    },
    [store],
  );
}

export function usePluginInstaller(
  store: SettingsStore,
  installFailed: string,
) {
  const marketplace = useMarketplaceInstall(store, installFailed);
  const addCustomMcp = useCustomMcpInstall(store);
  return {
    installingIds: marketplace.installingIds,
    install: marketplace.install,
    addCustomPlugin: store.addInstalledPlugin,
    addCustomMcp,
    togglePlugin: store.togglePluginActive,
    installError: marketplace.installError,
  };
}
