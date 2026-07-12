import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
} from "../../../lib/api/client";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServers,
} from "../../../lib/mcp/registry";
import { MARKET_LIMITS } from "../../../config/limits";
import type { McpServerPage, McpServerPageOptions } from "./types";

const DEFAULT_PAGE_LIMIT = 20;
const MAX_CURSOR_LENGTH = 512;
const MAX_SEARCH_LENGTH = 120;
const REGISTRY_UPSTREAM_LIMIT = 100;
const MAX_UPSTREAM_PAGES_PER_REQUEST = 10;

interface RegistryPageConfig {
  pageLimit: number;
  search: string;
  cursor: string;
}

function getNextCursor(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const raw = value as Record<string, unknown>;
  const metadata = getRecord(raw.metadata);
  const pagination = getRecord(raw.pagination);
  const cursor =
    raw.nextCursor || metadata.nextCursor || pagination.nextCursor || "";
  return typeof cursor === "string" ? cursor : "";
}

function getRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function getPageLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_PAGE_LIMIT;
  const requestedLimit = Math.floor(limit || DEFAULT_PAGE_LIMIT);
  return Math.max(1, Math.min(requestedLimit, MARKET_LIMITS.maxPlugins));
}

function getPageConfig(options: McpServerPageOptions): RegistryPageConfig {
  return {
    pageLimit: getPageLimit(options.limit),
    search: options.search?.trim().slice(0, MAX_SEARCH_LENGTH) || "",
    cursor: options.cursor?.trim().slice(0, MAX_CURSOR_LENGTH) || "",
  };
}

function buildRegistryUrl(options: { cursor: string; search: string }): string {
  const url = new URL(`${MCP_REGISTRY_BASE_URL}/servers`);
  url.searchParams.set("limit", String(REGISTRY_UPSTREAM_LIMIT));
  url.searchParams.set("version", "latest");
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.search) url.searchParams.set("search", options.search);
  return url.toString();
}

export async function fetchMcpRegistryServerPage(
  options: McpServerPageOptions = {},
): Promise<McpServerPage> {
  const config = getPageConfig(options);
  const plugins = [];
  let cursor = config.cursor;
  let nextCursor = "";

  for (let page = 0; page < MAX_UPSTREAM_PAGES_PER_REQUEST; page += 1) {
    if (plugins.length >= config.pageLimit) break;
    const response = await fetch(
      buildRegistryUrl({ cursor, search: config.search }),
      {
        method: "GET",
      },
    );
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Failed to fetch MCP servers"),
      );
    }

    const data = await readJsonResponseOrThrow<unknown>(
      response,
      "Failed to fetch MCP servers",
    );
    plugins.push(
      ...normalizeMcpRegistryServers(data, {
        maxServers: config.pageLimit - plugins.length,
      }),
    );
    nextCursor = getNextCursor(data);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return { plugins, ...(nextCursor ? { nextCursor } : {}) };
}
