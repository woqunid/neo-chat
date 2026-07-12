import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../../lib/api/client";
import { encryptSecret } from "../../../lib/byok/client";
import { BYOK_CONTEXTS } from "../../../lib/byok/shared";
import { DEFAULT_MCP_SERVER_LOGO_URL } from "../../../lib/mcp/defaults";
import { logDevError } from "../../../lib/utils/devLogger";
import type { Plugin } from "../../../types";
import type { CustomMcpServerInstallInput } from "./types";

const CUSTOM_MCP_SLUG_MAX_LENGTH = 60;

function slugifyCustomMcpName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, CUSTOM_MCP_SLUG_MAX_LENGTH) || "server"
  );
}

function normalizeCustomMcpServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("MCP server URL is required.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("MCP server URL must be a valid HTTPS URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("MCP server URL must use HTTPS.");
  }
  return url.toString();
}

function createCustomMcpPlugin(input: CustomMcpServerInstallInput): Plugin {
  const serverUrl = normalizeCustomMcpServerUrl(input.serverUrl);
  const url = new URL(serverUrl);
  const title = input.name.trim() || url.hostname;
  const hasBearerToken = Boolean(input.bearerToken?.trim());
  return {
    id: `custom-mcp-${slugifyCustomMcpName(title)}-${Date.now()}`,
    title,
    description: `Custom MCP server at ${url.origin}`,
    logoUrl: DEFAULT_MCP_SERVER_LOGO_URL,
    manifestUrl: "",
    source: "mcp",
    category: "MCP",
    categories: ["MCP"],
    added: new Date().toISOString(),
    functions: [],
    auth: hasBearerToken
      ? { type: "bearer", name: "Authorization", in: "header", required: true }
      : { type: "none", required: false },
    mcp: {
      transport: "streamable-http",
      serverUrl,
      serverName: title,
      serverVersion: "custom",
      toolNameMap: {},
    },
  };
}

async function requestInstalledPlugin(
  payload: object,
  failureMessage: string,
): Promise<Plugin> {
  const response = await signedApiFetch("/api/plugins/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await getResponseErrorMessage(response, failureMessage));
  }
  const data = await readJsonResponseOrThrow<{ plugin: Plugin }>(
    response,
    failureMessage,
  );
  return data.plugin;
}

export async function installPlugin(plugin: Plugin): Promise<Plugin> {
  try {
    return await requestInstalledPlugin({ plugin }, "Failed to install plugin");
  } catch (error) {
    logDevError(`Failed to install plugin ${plugin.id}:`, error);
    throw error;
  }
}

export async function installCustomPlugin(input: string): Promise<Plugin> {
  try {
    return await requestInstalledPlugin(
      { customInput: input },
      "Failed to install custom plugin",
    );
  } catch (error) {
    logDevError("Failed to install custom plugin:", error);
    throw error;
  }
}

async function createCustomMcpPayload(
  input: CustomMcpServerInstallInput,
): Promise<object> {
  const plugin = createCustomMcpPlugin(input);
  const token = input.bearerToken?.trim();
  if (!token) return { plugin };
  const valueSecret = await encryptSecret(
    token,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  return {
    plugin,
    authConfig: {
      type: "bearer",
      key: "Authorization",
      addTo: "header",
      valueSecret,
    },
  };
}

export async function installCustomMcpServer(
  input: CustomMcpServerInstallInput,
): Promise<Plugin> {
  const payload = await createCustomMcpPayload(input);
  const plugin = (payload as { plugin: Plugin }).plugin;
  try {
    return await requestInstalledPlugin(
      payload,
      "Failed to install custom MCP server",
    );
  } catch (error) {
    logDevError(`Failed to install custom MCP server ${plugin.id}:`, error);
    throw error;
  }
}
