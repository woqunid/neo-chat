import { MARKET_LIMITS } from "../../../config/limits";
import {
  getResponseErrorMessage,
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
import { fetchMcpRegistryServerPage } from "./mcpRegistryService";
import { getCachedMcpServers } from "./pluginCache";
import type { McpServerPage, McpServerPageOptions } from "./types";

let mcpServerListRequest: Promise<Plugin[]> | null = null;
const pageRequests = new Map<string, Promise<McpServerPage>>();

function buildPageUrl(options: McpServerPageOptions): string {
  const params = new URLSearchParams();
  const cursor = options.cursor?.trim();
  const search = options.search?.trim();
  if (cursor) params.set("cursor", cursor);
  if (search) params.set("search", search);
  if (Number.isFinite(options.limit) && options.limit && options.limit > 0) {
    params.set("limit", String(Math.floor(options.limit)));
  }
  const query = params.toString();
  return query ? `/api/mcp/servers?${query}` : "/api/mcp/servers";
}

async function fetchPageFromApi(requestUrl: string): Promise<McpServerPage> {
  const response = await signedApiFetch(requestUrl);
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Failed to fetch MCP servers"),
    );
  }
  const data = await readJsonResponseOrThrow<{
    plugins?: Plugin[];
    nextCursor?: string;
  }>(response, "Failed to fetch MCP servers");
  const plugins = normalizeMarketPlugins(data.plugins);
  return {
    plugins,
    ...(data.nextCursor ? { nextCursor: data.nextCursor } : {}),
  };
}

async function fetchPageFromSources(
  options: McpServerPageOptions,
  requestUrl: string,
): Promise<McpServerPage> {
  try {
    logDevInfo("Fetching MCP server page from API route...");
    return await fetchPageFromApi(requestUrl);
  } catch (error) {
    logDevWarn("Falling back to direct MCP registry fetch");
    logDevError("Error fetching MCP server page from API route:", error);
    return fetchMcpRegistryServerPage(options);
  }
}

function getStaleServers(error: unknown, servers: Plugin[]): Plugin[] {
  logDevError("Error fetching MCP server list:", error);
  if (!servers.length) return [];
  logDevWarn("Using stale MCP cache due to fetch error");
  return normalizeMarketPlugins(servers);
}

async function requestServerList(
  setMarketMcpServers: (plugins: Plugin[]) => void,
): Promise<Plugin[]> {
  logDevInfo("Fetching MCP servers from registry...");
  const options = { forceRefresh: true, limit: MARKET_LIMITS.maxPlugins };
  const page = await fetchPageFromSources(options, buildPageUrl(options));
  setMarketMcpServers(page.plugins);
  logDevInfo(`Cached ${page.plugins.length} MCP servers`);
  return page.plugins;
}

async function resolveServerList(
  request: Promise<Plugin[]>,
  staleServers: Plugin[],
): Promise<Plugin[]> {
  try {
    return await request;
  } catch (error) {
    return getStaleServers(error, staleServers);
  }
}

export async function fetchMcpServerList(
  forceRefresh: boolean = false,
): Promise<Plugin[]> {
  const { marketMcpServers, setMarketMcpServers } = useSettingsStore.getState();
  const cachedServers = getCachedMcpServers();
  if (!forceRefresh && cachedServers.length) {
    logDevInfo("Using cached MCP server data");
    return cachedServers;
  }
  if (!forceRefresh && mcpServerListRequest) {
    logDevInfo("Reusing in-flight MCP server request");
    return resolveServerList(mcpServerListRequest, marketMcpServers);
  }

  const request = requestServerList(setMarketMcpServers);
  mcpServerListRequest = request;
  try {
    return await resolveServerList(request, marketMcpServers);
  } finally {
    if (mcpServerListRequest === request) mcpServerListRequest = null;
  }
}

function getStalePage(
  error: unknown,
  shouldUseCache: boolean,
  staleServers: Plugin[],
): McpServerPage {
  logDevError("Error fetching MCP server page:", error);
  if (!shouldUseCache || !staleServers.length) return { plugins: [] };
  logDevWarn("Using stale MCP cache due to paged fetch error");
  return { plugins: normalizeMarketPlugins(staleServers) };
}

function shouldCachePage(options: McpServerPageOptions): boolean {
  return !options.cursor?.trim() && !options.search?.trim();
}

function getActivePageRequest(
  requestUrl: string,
  forceRefresh: boolean | undefined,
): Promise<McpServerPage> | undefined {
  if (forceRefresh) return undefined;
  return pageRequests.get(requestUrl);
}

function trackPageRequest(
  requestUrl: string,
  request: Promise<McpServerPage>,
  forceRefresh: boolean | undefined,
): void {
  if (!forceRefresh) pageRequests.set(requestUrl, request);
}

function releasePageRequest(
  requestUrl: string,
  request: Promise<McpServerPage>,
): void {
  if (pageRequests.get(requestUrl) === request) pageRequests.delete(requestUrl);
}

async function resolvePageRequest(
  request: Promise<McpServerPage>,
  shouldUseCache: boolean,
  staleServers: Plugin[],
): Promise<McpServerPage> {
  try {
    return await request;
  } catch (error) {
    return getStalePage(error, shouldUseCache, staleServers);
  }
}

export async function fetchMcpServerPage(
  options: McpServerPageOptions = {},
): Promise<McpServerPage> {
  const { marketMcpServers, setMarketMcpServers } = useSettingsStore.getState();
  const requestUrl = buildPageUrl(options);
  const shouldCache = shouldCachePage(options);
  const activeRequest = getActivePageRequest(requestUrl, options.forceRefresh);
  if (activeRequest) {
    return resolvePageRequest(activeRequest, shouldCache, marketMcpServers);
  }

  const request = fetchPageFromSources(options, requestUrl).then((page) => {
    if (shouldCache) setMarketMcpServers(page.plugins);
    return page;
  });
  trackPageRequest(requestUrl, request, options.forceRefresh);

  try {
    return await resolvePageRequest(request, shouldCache, marketMcpServers);
  } finally {
    releasePageRequest(requestUrl, request);
  }
}
