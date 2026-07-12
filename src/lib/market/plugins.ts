import type { Plugin } from "../../types";
import { MARKET_LIMITS } from "../../config/limits";
import { getApiGuruPluginCandidates } from "./apiGuru";
import {
  asRecord,
  normalizePluginCategories,
  trimString,
} from "./pluginPrimitives";

const PLUGIN_ID_RE = /^[A-Za-z0-9._:-]+$/;
const MCP_PLUGIN_ID_RE = /^[A-Za-z0-9._:/-]+$/;
const PLUGIN_SOURCES = new Set(["builtin", "openapi", "mcp"]);
const PLUGIN_AUTH_TYPES = new Set([
  "bearer",
  "apiKey",
  "basic",
  "oauth2",
  "none",
]);
const PLUGIN_AUTH_LOCATIONS = new Set(["header", "query"]);

function trimWebUrl(value: unknown, maxChars: number): string {
  const candidate = trimString(value, maxChars);
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function trimDisplayImageUrl(value: unknown, maxChars: number): string {
  const candidate = trimString(value, maxChars);
  if (!candidate) return "";
  if (candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }

  return trimWebUrl(candidate, maxChars);
}

function trimHttpsUrl(value: unknown, maxChars: number): string {
  const candidate = trimString(value, maxChars);
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeHeaderMap(
  value: unknown,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const name = trimString(rawName, 120);
    const headerValue = trimString(rawValue, 4_096);
    if (!name || !headerValue) continue;

    headers[name] = headerValue;
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizePluginAuth(value: unknown): Plugin["auth"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const raw = value as Record<string, unknown>;
  const type = trimString(raw.type, 40);
  if (!PLUGIN_AUTH_TYPES.has(type)) return undefined;

  const name = trimString(raw.name, 120);
  const location = trimString(raw.in, 20);

  return {
    type: type as NonNullable<Plugin["auth"]>["type"],
    ...(name ? { name } : {}),
    ...(PLUGIN_AUTH_LOCATIONS.has(location)
      ? { in: location as NonNullable<Plugin["auth"]>["in"] }
      : {}),
    ...(typeof raw.required === "boolean" ? { required: raw.required } : {}),
  };
}

function normalizeMcpMetadata(value: unknown): Plugin["mcp"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const raw = value as Record<string, unknown>;
  const serverUrl = trimHttpsUrl(raw.serverUrl, 2_048);
  const serverName = trimString(
    raw.serverName,
    MARKET_LIMITS.maxPluginTitleChars,
  );
  if (!serverUrl || !serverName) return undefined;

  const toolNameMap =
    raw.toolNameMap && typeof raw.toolNameMap === "object"
      ? Object.fromEntries(
          Object.entries(raw.toolNameMap as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, value as string]),
        )
      : {};

  return {
    transport: "streamable-http",
    serverUrl,
    serverName,
    serverVersion:
      trimString(raw.serverVersion, MARKET_LIMITS.maxAgentCreatedAtChars) ||
      undefined,
    headers: normalizeHeaderMap(raw.headers),
    toolNameMap,
  };
}

interface PluginIdentity {
  id: string;
  source?: NonNullable<Plugin["source"]>;
}

function normalizePluginIdentity(
  raw: Record<string, unknown>,
): PluginIdentity | null {
  const id = trimString(raw.id, MARKET_LIMITS.maxPluginIdChars);
  const source = trimString(raw.source, 40);
  const pluginSource = PLUGIN_SOURCES.has(source)
    ? (source as NonNullable<Plugin["source"]>)
    : undefined;
  const idPattern = pluginSource === "mcp" ? MCP_PLUGIN_ID_RE : PLUGIN_ID_RE;
  if (!id || !idPattern.test(id)) return null;
  return { id, source: pluginSource };
}

function getPluginCategory(
  raw: Record<string, unknown>,
  categories: string[],
  id: string,
): string {
  const category = trimString(
    raw.category,
    MARKET_LIMITS.maxPluginCategoryChars,
  );
  if (category) return category;
  if (categories[0]) return categories[0];
  return id.split(":")[0] || "General";
}

function getOptionalPluginFields(
  source: Plugin["source"] | undefined,
  mcp: Plugin["mcp"] | undefined,
): Partial<Pick<Plugin, "source" | "mcp">> {
  return {
    ...(source ? { source } : {}),
    ...(mcp ? { mcp } : {}),
  };
}

export function normalizeMarketPlugin(value: unknown): Plugin | null {
  const raw = asRecord(value);
  if (!raw) return null;
  const identity = normalizePluginIdentity(raw);
  if (!identity) return null;

  const mcp =
    identity.source === "mcp" ? normalizeMcpMetadata(raw.mcp) : undefined;

  const manifestUrl = trimWebUrl(
    raw.manifestUrl,
    MARKET_LIMITS.maxPluginManifestUrlChars,
  );
  if (!manifestUrl && !mcp) return null;

  const categories = normalizePluginCategories(raw.categories);

  return {
    id: identity.id,
    title:
      trimString(raw.title, MARKET_LIMITS.maxPluginTitleChars) || identity.id,
    description:
      trimString(raw.description, MARKET_LIMITS.maxPluginDescriptionChars) ||
      "No description provided",
    logoUrl: trimDisplayImageUrl(
      raw.logoUrl,
      MARKET_LIMITS.maxPluginLogoUrlChars,
    ),
    manifestUrl,
    externalDocsUrl:
      trimWebUrl(raw.externalDocsUrl, MARKET_LIMITS.maxPluginDocsUrlChars) ||
      undefined,
    functions: [],
    ...getOptionalPluginFields(identity.source, mcp),
    category: getPluginCategory(raw, categories, identity.id),
    categories,
    added: trimString(raw.added, MARKET_LIMITS.maxAgentCreatedAtChars),
    auth: normalizePluginAuth(raw.auth),
  };
}

export function normalizeMarketPlugins(value: unknown): Plugin[] {
  if (!Array.isArray(value)) return [];

  const plugins: Plugin[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const plugin = normalizeMarketPlugin(item);
    if (!plugin || seen.has(plugin.id)) continue;

    plugins.push(plugin);
    seen.add(plugin.id);
    if (plugins.length >= MARKET_LIMITS.maxPlugins) break;
  }

  return plugins;
}

export function normalizeApiGuruPlugins(value: unknown): Plugin[] {
  return normalizeMarketPlugins(getApiGuruPluginCandidates(value));
}
