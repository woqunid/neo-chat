import { MARKET_LIMITS } from "../../config/limits";
import type { Plugin } from "../../types";
import { DEFAULT_MCP_SERVER_LOGO_URL } from "./defaults";
import {
  getMcpRemoteEndpoint,
  getServerEntry,
  normalizeWebUrl,
  trimRegistryString,
} from "./registryRemote";
import type { NormalizedMcpRemote } from "./registryRemote";

export {
  buildMcpToolFunctionName,
  normalizeMcpToolFunctions,
} from "./registryTools";
export type { McpRegistryTool } from "./registryTools";

export const MCP_REGISTRY_BASE_URL =
  "https://registry.modelcontextprotocol.io/v0.1";

export interface McpRegistryListOptions {
  maxServers?: number;
}

function getExternalDocsUrl(server: Record<string, unknown>): string {
  const repository = getServerEntry(server.repository);
  return (
    normalizeWebUrl(server.homepage) ||
    normalizeWebUrl(server.websiteUrl) ||
    normalizeWebUrl(repository?.url) ||
    normalizeWebUrl(server.repositoryUrl)
  );
}

function normalizeRegistryServer(
  rawServer: unknown,
  seen: Set<string>,
): Plugin | null {
  const server = getServerEntry(rawServer);
  if (!server) return null;
  const serverName = trimRegistryString(
    server.name,
    MARKET_LIMITS.maxPluginTitleChars,
  );
  const remote = getMcpRemoteEndpoint(server);
  if (!serverName || !remote) return null;

  const serverVersion =
    trimRegistryString(server.version, MARKET_LIMITS.maxAgentCreatedAtChars) ||
    trimRegistryString(
      server.latestVersion,
      MARKET_LIMITS.maxAgentCreatedAtChars,
    ) ||
    "latest";
  const id = `mcp:${serverName}:${serverVersion}`;
  if (seen.has(id)) return null;
  seen.add(id);
  return buildRegistryPlugin(server, remote, { id, serverName, serverVersion });
}

function buildRegistryPlugin(
  server: Record<string, unknown>,
  remote: NormalizedMcpRemote,
  identity: { id: string; serverName: string; serverVersion: string },
): Plugin {
  const { id, serverName, serverVersion } = identity;
  const encodedName = encodeURIComponent(serverName);
  const encodedVersion = encodeURIComponent(serverVersion);
  return {
    id,
    source: "mcp",
    title: serverName,
    description:
      trimRegistryString(
        server.description,
        MARKET_LIMITS.maxPluginDescriptionChars,
      ) || "No description provided",
    logoUrl:
      normalizeWebUrl(server.iconUrl) ||
      normalizeWebUrl(server.logoUrl) ||
      DEFAULT_MCP_SERVER_LOGO_URL,
    manifestUrl: `${MCP_REGISTRY_BASE_URL}/servers/${encodedName}/versions/${encodedVersion}`,
    externalDocsUrl: getExternalDocsUrl(server) || undefined,
    functions: [],
    category: "MCP",
    categories: ["MCP"],
    auth: remote.auth || { type: "none", required: false },
    mcp: {
      transport: "streamable-http",
      serverUrl: remote.serverUrl,
      serverName,
      serverVersion,
      ...(remote.headers ? { headers: remote.headers } : {}),
      toolNameMap: {},
    },
  };
}

function getRawServers(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = getServerEntry(value);
  return record && Array.isArray(record.servers) ? record.servers : [];
}

export function normalizeMcpRegistryServers(
  value: unknown,
  options: McpRegistryListOptions = {},
): Plugin[] {
  const maxServers = Math.max(
    1,
    Math.min(
      options.maxServers || MARKET_LIMITS.maxPlugins,
      MARKET_LIMITS.maxPlugins,
    ),
  );
  const plugins: Plugin[] = [];
  const seen = new Set<string>();
  for (const rawServer of getRawServers(value)) {
    const plugin = normalizeRegistryServer(rawServer, seen);
    if (plugin) plugins.push(plugin);
    if (plugins.length >= maxServers) break;
  }
  return plugins;
}

export function normalizeMcpRegistryServer(value: unknown): Plugin | null {
  return normalizeMcpRegistryServers([value], { maxServers: 1 })[0] || null;
}
