import { MARKET_LIMITS } from "../../config/limits";
import type { Plugin } from "../../types";

const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export interface NormalizedMcpRemote {
  serverUrl: string;
  auth?: Plugin["auth"];
  headers?: Record<string, string>;
}

export function isRegistryRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getServerEntry(value: unknown): Record<string, unknown> | null {
  if (!isRegistryRecord(value)) return null;
  return isRegistryRecord(value.server) ? value.server : value;
}

export function trimRegistryString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

export function normalizeWebUrl(value: unknown): string {
  const raw = trimRegistryString(value, MARKET_LIMITS.maxPluginDocsUrlChars);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function normalizeHttpsUrl(value: unknown): string {
  const raw = trimRegistryString(
    value,
    MARKET_LIMITS.maxPluginManifestUrlChars,
  );
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function buildHeaderAuth(name: string, required: boolean): Plugin["auth"] {
  return {
    type: name.toLowerCase() === "authorization" ? "bearer" : "apiKey",
    name,
    in: "header",
    required,
  };
}

function parseRemoteHeader(rawHeader: unknown): {
  name: string;
  staticValue: string;
  auth?: Plugin["auth"];
} | null {
  if (!isRegistryRecord(rawHeader)) return null;
  const name = trimRegistryString(rawHeader.name, 120);
  if (!name || !HEADER_NAME_RE.test(name)) return null;
  const rawValue = trimRegistryString(rawHeader.value, 4_096);
  const staticValue = /\{[^}]+\}/.test(rawValue) ? "" : rawValue;
  if (staticValue && rawHeader.isSecret !== true) return { name, staticValue };
  const dynamic =
    rawHeader.isSecret === true ||
    (rawHeader.isRequired === true && !staticValue) ||
    /\{[^}]+\}/.test(rawValue);
  return dynamic
    ? {
        name,
        staticValue: "",
        auth: buildHeaderAuth(name, rawHeader.isRequired === true),
      }
    : null;
}

function normalizeRemoteHeaders(
  remote: Record<string, unknown>,
): Pick<NormalizedMcpRemote, "auth" | "headers"> | null {
  const rawHeaders = Array.isArray(remote.headers) ? remote.headers : [];
  const headers: Record<string, string> = {};
  let auth: Plugin["auth"] | undefined;
  for (const rawHeader of rawHeaders) {
    const header = parseRemoteHeader(rawHeader);
    if (!header) continue;
    if (header.staticValue) headers[header.name] = header.staticValue;
    if (header.auth && auth) return null;
    if (header.auth) auth = header.auth;
  }
  return {
    ...(auth ? { auth } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
  };
}

function hasUnresolvedVariables(
  rawUrl: string,
  remote: Record<string, unknown>,
): boolean {
  return (
    /\{[^}]+\}/.test(rawUrl) ||
    (isRegistryRecord(remote.variables) &&
      Object.keys(remote.variables).length > 0)
  );
}

function normalizeRemote(remote: unknown): NormalizedMcpRemote | null {
  if (!isRegistryRecord(remote)) return null;
  const transport =
    trimRegistryString(remote.type, 80) ||
    trimRegistryString(remote.transport, 80);
  if (transport !== "streamable-http") return null;
  const rawUrl = trimRegistryString(
    remote.url,
    MARKET_LIMITS.maxPluginManifestUrlChars,
  );
  if (!rawUrl || hasUnresolvedVariables(rawUrl, remote)) return null;
  const serverUrl = normalizeHttpsUrl(rawUrl);
  const headerMetadata = normalizeRemoteHeaders(remote);
  return serverUrl && headerMetadata ? { serverUrl, ...headerMetadata } : null;
}

export function getMcpRemoteEndpoint(
  server: Record<string, unknown>,
): NormalizedMcpRemote | null {
  const remotes = Array.isArray(server.remotes) ? server.remotes : [];
  for (const remote of remotes) {
    const normalized = normalizeRemote(remote);
    if (normalized) return normalized;
  }
  return null;
}
