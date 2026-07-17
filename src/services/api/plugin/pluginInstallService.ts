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
import { useSettingsStore } from "@/store/core/settingsStore";
import { resolvePluginAuthValue } from "../../../lib/security/localSecretResolvers";

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
  const credential = input.credential?.trim() || input.bearerToken?.trim();
  const authType = input.authType || (credential ? "bearer" : "none");
  const authKey =
    input.authKey?.trim() ||
    (authType === "apiKey" ? "X-API-Key" : "Authorization");
  const authLocation = input.authLocation || "header";
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
    auth:
      authType === "none"
        ? { type: "none", required: false }
        : {
            type: authType,
            name: authKey,
            in: authLocation,
            required: true,
          },
    mcp: {
      transport: "streamable-http",
      serverUrl,
      serverName: title,
      serverVersion: "custom",
      ...(input.staticHeaders && Object.keys(input.staticHeaders).length
        ? { headers: input.staticHeaders }
        : {}),
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

async function buildInstallAuthConfig(
  plugin: Plugin,
  value: string | undefined,
): Promise<object | undefined> {
  const secretValue = value?.trim();
  if (!secretValue) return undefined;
  return {
    type:
      plugin.auth?.type === "apiKey" || plugin.auth?.type === "oauth2"
        ? plugin.auth.type
        : "bearer",
    key:
      plugin.auth?.name ||
      (plugin.auth?.type === "apiKey" ? "X-API-Key" : "Authorization"),
    addTo: plugin.auth?.in || "header",
    valueSecret: await encryptSecret(
      secretValue,
      BYOK_CONTEXTS.pluginAuth(plugin.id),
    ),
  };
}

export async function installPlugin(
  plugin: Plugin,
  credential?: string,
): Promise<Plugin> {
  try {
    const authConfig = await buildInstallAuthConfig(plugin, credential);
    return await requestInstalledPlugin(
      { plugin, ...(authConfig ? { authConfig } : {}) },
      "Failed to install plugin",
    );
  } catch (error) {
    logDevError(`Failed to install plugin ${plugin.id}:`, error);
    throw error;
  }
}

export async function refreshMcpPlugin(plugin: Plugin): Promise<Plugin> {
  const config = useSettingsStore.getState().pluginConfigs[plugin.id];
  const value = config?.auth
    ? await resolvePluginAuthValue(plugin.id, config.auth)
    : undefined;
  return installPlugin(plugin, value);
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
  const credential = input.credential?.trim() || input.bearerToken?.trim();
  if (!credential) return { plugin };
  const valueSecret = await encryptSecret(
    credential,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  return {
    plugin,
    authConfig: {
      type:
        plugin.auth?.type === "apiKey" || plugin.auth?.type === "oauth2"
          ? plugin.auth.type
          : "bearer",
      key: plugin.auth?.name || "Authorization",
      addTo: plugin.auth?.in || "header",
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

export async function uninstallPlugin(pluginId: string): Promise<void> {
  const response = await signedApiFetch("/api/plugins/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pluginId }),
  });
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Failed to uninstall plugin"),
    );
  }
}
