import { CACHE_CONFIG } from "../../../config/api";
import { normalizeMarketPlugins } from "../../../lib/market/plugins";
import { logDevInfo } from "../../../lib/utils/devLogger";
import { useSettingsStore } from "@/store/core/settingsStore";
import type { Plugin } from "../../../types";

function getFreshPlugins(
  plugins: Plugin[] | undefined,
  timestamp: number | undefined,
): Plugin[] {
  if (!plugins?.length || !timestamp) return [];
  if (Date.now() - timestamp >= CACHE_CONFIG.plugins) return [];
  return normalizeMarketPlugins(plugins);
}

export function getCachedPlugins(): Plugin[] {
  const { marketPlugins, marketPluginsTimestamp } = useSettingsStore.getState();
  return getFreshPlugins(marketPlugins, marketPluginsTimestamp);
}

export function getCachedMcpServers(): Plugin[] {
  const { marketMcpServers, marketMcpServersTimestamp } =
    useSettingsStore.getState();
  return getFreshPlugins(marketMcpServers, marketMcpServersTimestamp);
}

export function clearPluginsCache(): void {
  const { setMarketPlugins, setMarketMcpServers } = useSettingsStore.getState();
  setMarketPlugins([]);
  setMarketMcpServers([]);
  logDevInfo("Plugins cache cleared");
}
