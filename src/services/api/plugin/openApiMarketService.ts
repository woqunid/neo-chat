import {
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../../lib/api/client";
import { normalizeMarketPlugins } from "../../../lib/market/plugins";
import {
  logDevError,
  logDevInfo,
  logDevWarn,
} from "../../../lib/utils/devLogger";
import { useSettingsStore } from "@/store/core/settingsStore";
import type { Plugin } from "../../../types";
import { getCachedPlugins } from "./pluginCache";

let pluginListRequest: Promise<Plugin[]> | null = null;

function getStalePlugins(error: unknown, plugins: Plugin[]): Plugin[] {
  logDevError("Error fetching plugin list:", error);
  if (!plugins.length) return [];
  logDevWarn("Using stale cache due to fetch error");
  return normalizeMarketPlugins(plugins);
}

async function requestPluginList(
  setMarketPlugins: (plugins: Plugin[]) => void,
): Promise<Plugin[]> {
  logDevInfo("Fetching plugins from API...");
  const response = await signedApiFetch("/api/plugins/list");
  if (!response.ok) throw new Error("Failed to fetch plugins");

  const data = await readJsonResponseOrThrow<{ plugins?: Plugin[] }>(
    response,
    "Failed to fetch plugins",
  );
  const plugins = normalizeMarketPlugins(data.plugins);
  setMarketPlugins(plugins);
  logDevInfo(`Cached ${plugins.length} plugins`);
  return plugins;
}

async function resolvePluginRequest(
  request: Promise<Plugin[]>,
  stalePlugins: Plugin[],
): Promise<Plugin[]> {
  try {
    return await request;
  } catch (error) {
    return getStalePlugins(error, stalePlugins);
  }
}

export async function fetchApiGuruList(
  forceRefresh: boolean = false,
): Promise<Plugin[]> {
  const { marketPlugins, setMarketPlugins } = useSettingsStore.getState();
  const cachedPlugins = getCachedPlugins();
  if (!forceRefresh && cachedPlugins.length) {
    logDevInfo("Using cached plugins data");
    return cachedPlugins;
  }

  if (!forceRefresh && pluginListRequest) {
    logDevInfo("Reusing in-flight plugins request");
    return resolvePluginRequest(pluginListRequest, marketPlugins);
  }

  const request = requestPluginList(setMarketPlugins);
  pluginListRequest = request;
  try {
    return await resolvePluginRequest(request, marketPlugins);
  } finally {
    if (pluginListRequest === request) pluginListRequest = null;
  }
}
