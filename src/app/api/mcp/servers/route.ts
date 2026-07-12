import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/api/middleware";
import { MARKET_LIMITS } from "../../../../config/limits";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServers,
} from "../../../../lib/mcp/registry";
import { safeFetchJson } from "../../../../lib/security/safeFetch";
import { getSafeUrlPolicy } from "../../../../lib/security/urlPolicy";
import { safeServerLogError } from "../../../../lib/utils/safeServerLog";

const MCP_REGISTRY_UPSTREAM_LIMIT = 100;
const MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST = 10;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_SEARCH_CHARS = 120;
const MAX_CURSOR_CHARS = 512;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getNextCursor(value: unknown): string {
  const raw = asRecord(value);
  if (!raw) return "";
  const candidates = [
    raw.nextCursor,
    asRecord(raw.metadata)?.nextCursor,
    asRecord(raw.pagination)?.nextCursor,
  ];
  return candidates.find((candidate) => typeof candidate === "string") || "";
}

function getPageLimit(requestUrl: URL): number {
  const parsed = Number(requestUrl.searchParams.get("limit"));
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_LIMIT;
  return Math.max(1, Math.min(Math.floor(parsed), MARKET_LIMITS.maxPlugins));
}

function getSearchParam(requestUrl: URL): string {
  return (requestUrl.searchParams.get("search") || "")
    .trim()
    .slice(0, MAX_SEARCH_CHARS);
}

function getCursorParam(requestUrl: URL): string {
  return (requestUrl.searchParams.get("cursor") || "")
    .trim()
    .slice(0, MAX_CURSOR_CHARS);
}

interface RegistryPageOptions {
  cursor: string;
  search: string;
}

async function fetchRegistryPage(options: RegistryPageOptions) {
  const url = new URL(`${MCP_REGISTRY_BASE_URL}/servers`);
  url.searchParams.set("limit", String(MCP_REGISTRY_UPSTREAM_LIMIT));
  url.searchParams.set("version", "latest");
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.search) url.searchParams.set("search", options.search);

  const result = await safeFetchJson<unknown>(
    url.toString(),
    { method: "GET" },
    {
      policy: {
        ...getSafeUrlPolicy("pluginManifest"),
        allowedHosts: ["registry.modelcontextprotocol.io"],
      },
      timeoutMs: 20_000,
      maxResponseBytes: MARKET_LIMITS.maxPluginListResponseBytes,
    },
  );
  if (!result.response.ok) throw new Error("Failed to fetch MCP registry");
  return result.data;
}

async function listRegistryPlugins(requestUrl: URL) {
  const pageLimit = getPageLimit(requestUrl);
  const search = getSearchParam(requestUrl);
  const plugins = [];
  let cursor = getCursorParam(requestUrl);
  let nextCursor = "";

  for (
    let page = 0;
    page < MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST &&
    plugins.length < pageLimit;
    page += 1
  ) {
    const data = await fetchRegistryPage({ cursor, search });
    plugins.push(
      ...normalizeMcpRegistryServers(data, {
        maxServers: pageLimit - plugins.length,
      }),
    );
    nextCursor = getNextCursor(data);
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return { plugins, nextCursor };
}

export async function GET(request: Request) {
  try {
    const { plugins, nextCursor } = await listRegistryPlugins(
      new URL(request.url),
    );
    return NextResponse.json({
      plugins,
      nextCursor: nextCursor || undefined,
    });
  } catch (error) {
    safeServerLogError("Error fetching MCP servers:", error);
    return createApiErrorResponse(error, "Failed to fetch MCP servers");
  }
}
