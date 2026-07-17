import { decryptOptionalSecret } from "../byok/server";
import { BYOK_CONTEXTS } from "../byok/shared";
import { isPluginAuthRequired } from "../plugin/config";
import { getServerPlugin } from "../plugin/serverRegistry";
import type { McpAuthConfig } from "./types";
import type { Plugin } from "../../types";

interface BrowserAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  valueSecret?: Parameters<typeof decryptOptionalSecret>[0];
  key?: string;
  addTo?: "header" | "query";
}

export interface ResolvedMcpPluginRequest {
  plugin: Plugin;
  authConfig?: McpAuthConfig;
}

export async function resolveMcpPluginRequest(options: {
  pluginId: string;
  authConfig?: BrowserAuthConfig;
}): Promise<ResolvedMcpPluginRequest> {
  const plugin = await getServerPlugin(options.pluginId);
  if (!plugin?.mcp?.serverUrl || plugin.source !== "mcp") {
    throw new Error("MCP plugin is not registered on the server");
  }
  const authValue = await decryptOptionalSecret(
    options.authConfig?.valueSecret,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  if (isPluginAuthRequired(plugin) && !authValue) {
    throw new Error("MCP plugin authentication is required");
  }
  return {
    plugin,
    ...(authValue
      ? {
          authConfig: {
            type:
              options.authConfig?.type ||
              (plugin.auth?.type === "apiKey" ? "apiKey" : "bearer"),
            value: authValue,
            key: options.authConfig?.key || plugin.auth?.name,
            addTo: options.authConfig?.addTo || plugin.auth?.in,
          },
        }
      : {}),
  };
}
