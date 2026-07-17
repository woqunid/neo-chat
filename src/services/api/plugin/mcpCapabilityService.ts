import {
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../../lib/api/client";
import { encryptSecret } from "../../../lib/byok/client";
import { BYOK_CONTEXTS } from "../../../lib/byok/shared";
import { resolvePluginAuthValue } from "../../../lib/security/localSecretResolvers";
import { useSettingsStore } from "@/store/core/settingsStore";
import type {
  McpPromptDescriptor,
  McpResourceDescriptor,
  McpResourceTemplateDescriptor,
  Plugin,
} from "../../../types";

const capabilitySessions = new Map<string, string>();

function getCapabilitySession(pluginId: string): string {
  const current = capabilitySessions.get(pluginId);
  if (current) return current;
  const created = crypto.randomUUID();
  capabilitySessions.set(pluginId, created);
  return created;
}

async function buildPayload(plugin: Plugin, extra: object) {
  const config = useSettingsStore.getState().pluginConfigs[plugin.id];
  const value = config?.auth
    ? await resolvePluginAuthValue(plugin.id, config.auth)
    : undefined;
  const valueSecret = value
    ? await encryptSecret(value, BYOK_CONTEXTS.pluginAuth(plugin.id))
    : undefined;
  return {
    pluginId: plugin.id,
    sessionId: getCapabilitySession(plugin.id),
    roots: config?.mcp?.roots,
    ...(valueSecret
      ? {
          authConfig: {
            type: config?.auth?.type,
            key: config?.auth?.key,
            addTo: config?.auth?.addTo,
            valueSecret,
          },
        }
      : {}),
    ...extra,
  };
}

async function requestCapability<T>(
  path: string,
  plugin: Plugin,
  extra: object,
): Promise<T> {
  const response = await signedApiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await buildPayload(plugin, extra)),
  });
  return readJsonResponseOrThrow<T>(response, "MCP capability request failed");
}

export async function listMcpResources(plugin: Plugin): Promise<{
  resources: McpResourceDescriptor[];
  resourceTemplates: McpResourceTemplateDescriptor[];
}> {
  return requestCapability("/api/mcp/resources", plugin, { action: "list" });
}

export async function readMcpResourceContent(
  plugin: Plugin,
  uri: string,
): Promise<unknown> {
  const data = await requestCapability<{ result: unknown }>(
    "/api/mcp/resources",
    plugin,
    { action: "read", uri },
  );
  return data.result;
}

export async function setMcpResourceSubscription(
  plugin: Plugin,
  uri: string,
  subscribed: boolean,
): Promise<void> {
  await requestCapability("/api/mcp/resources", plugin, {
    action: subscribed ? "subscribe" : "unsubscribe",
    uri,
  });
}

export async function listMcpPrompts(
  plugin: Plugin,
): Promise<McpPromptDescriptor[]> {
  const data = await requestCapability<{ prompts: McpPromptDescriptor[] }>(
    "/api/mcp/prompts",
    plugin,
    { action: "list" },
  );
  return data.prompts;
}

export async function getMcpPromptContent(
  plugin: Plugin,
  name: string,
  args: Record<string, string>,
): Promise<unknown> {
  const data = await requestCapability<{ result: unknown }>(
    "/api/mcp/prompts",
    plugin,
    { action: "get", name, args },
  );
  return data.result;
}

export async function completeMcpPromptValue(
  plugin: Plugin,
  name: string,
  argumentName: string,
  value: string,
): Promise<string[]> {
  const data = await requestCapability<{ values: string[] }>(
    "/api/mcp/prompts",
    plugin,
    { action: "complete", name, argumentName, value },
  );
  return data.values || [];
}
