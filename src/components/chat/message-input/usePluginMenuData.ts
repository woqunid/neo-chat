import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Plugin } from "@/types";
import { localizePluginMeta } from "@/lib/plugin/localizedMeta";
import { isPluginAuthRequired } from "@/lib/plugin/config";
import { hasPluginAuthValue } from "@/lib/security/localSecretResolvers";
import { useSettingsStore } from "@/store/core/settingsStore";
import type { PluginSourceGroups } from "./types";

export interface PluginMenuData {
  readonly validPlugins: Plugin[];
  readonly groups: PluginSourceGroups;
  readonly activeIds: string[];
  readonly installedCount: number;
  toggle: (pluginId: string) => void;
}

function groupPlugins(plugins: Plugin[]): PluginSourceGroups {
  return plugins.reduce<PluginSourceGroups>(
    (groups, plugin) =>
      plugin.source === "mcp"
        ? { ...groups, mcp: [...groups.mcp, plugin] }
        : { ...groups, plugins: [...groups.plugins, plugin] },
    { plugins: [], mcp: [] },
  );
}

export function usePluginMenuData(): PluginMenuData {
  const tConfig = useTranslations("Config");
  const installed = useSettingsStore((state) => state.installedPlugins);
  const activeIds = useSettingsStore((state) => state.activePlugins);
  const configs = useSettingsStore((state) => state.pluginConfigs);
  const toggle = useSettingsStore((state) => state.togglePluginActive);
  const validPlugins = useMemo(
    () =>
      installed
        .filter((plugin) => {
          if (!isPluginAuthRequired(plugin)) return true;
          return hasPluginAuthValue(configs[plugin.id]?.auth);
        })
        .map((plugin) => localizePluginMeta(plugin, tConfig)),
    [configs, installed, tConfig],
  );
  const groups = useMemo(() => groupPlugins(validPlugins), [validPlugins]);
  return {
    validPlugins,
    groups,
    activeIds,
    installedCount: installed.length,
    toggle,
  };
}
