import { NextResponse } from "next/server";
import type { z } from "zod";
import { PluginInstallSchema } from "@/lib/api/schemas";
import { decryptOptionalSecret } from "../../../../lib/byok/server";
import { BYOK_CONTEXTS } from "../../../../lib/byok/shared";
import { discoverMcpServer } from "@/lib/mcp/client";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServer,
  normalizeMcpToolFunctions,
} from "../../../../lib/mcp/registry";
import { convertOpenApiSpecToPlugin } from "@/lib/plugin/openapi";
import { isPluginAuthRequired } from "../../../../lib/plugin/config";
import { registerServerPlugin } from "@/lib/plugin/serverRegistry";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import type {
  McpPromptDescriptor,
  McpResourceDescriptor,
  McpResourceTemplateDescriptor,
  Plugin,
  PluginFunction,
} from "@/types";
import type { McpDiscoveryResult } from "@/lib/mcp/client";

const MANIFEST_TIMEOUT_MS = 20_000;
const MAX_MANIFEST_BYTES = 3 * 1024 * 1024;

type InstallBody = z.infer<typeof PluginInstallSchema>;
type InstallAuth = InstallBody["authConfig"];

function errorResponse(error: string, code: string): NextResponse {
  return NextResponse.json({ error, code, statusCode: 400 }, { status: 400 });
}

async function fetchManifest(url: string): Promise<unknown> {
  const { response, data } = await safeFetchJson<unknown>(
    url,
    { method: "GET" },
    {
      policy: getSafeUrlPolicy("pluginManifest"),
      timeoutMs: MANIFEST_TIMEOUT_MS,
      maxResponseBytes: MAX_MANIFEST_BYTES,
    },
  );
  if (!response.ok) throw new Error("Failed to fetch plugin manifest");
  return data;
}

async function parseCustomSpec(input: string) {
  const value = input.trim();
  try {
    return {
      spec: value.startsWith("http")
        ? await fetchManifest(value)
        : JSON.parse(value),
      url: value.startsWith("http") ? value : "",
    };
  } catch {
    return null;
  }
}

async function installCustomPlugin(input: string): Promise<NextResponse> {
  const parsed = await parseCustomSpec(input);
  if (!parsed) {
    return errorResponse(
      "Invalid OpenAPI spec or URL",
      "PLUGIN_MANIFEST_INVALID",
    );
  }
  const spec = parsed.spec as Record<string, any>;
  const id = `custom-${Date.now()}`;
  const installed = convertOpenApiSpecToPlugin(
    spec,
    {
      id,
      title: spec.info?.title || "Custom Plugin",
      description: spec.info?.description || "User added plugin",
      manifestUrl: parsed.url,
      category: "Custom",
      added: new Date().toISOString(),
    },
    parsed.url || undefined,
  );
  await registerServerPlugin(installed as Plugin);
  return NextResponse.json({ plugin: installed });
}

function isRegistryPlugin(plugin: Plugin): boolean {
  if (plugin.source !== "mcp" || !plugin.id.startsWith("mcp:")) return false;
  if (!plugin.manifestUrl) return false;
  try {
    return (
      new URL(plugin.manifestUrl).origin ===
      new URL(MCP_REGISTRY_BASE_URL).origin
    );
  } catch {
    return false;
  }
}

async function resolveTrustedMcpPlugin(plugin: Plugin): Promise<Plugin> {
  if (!isRegistryPlugin(plugin)) return plugin;
  const { response, data } = await safeFetchJson<unknown>(
    plugin.manifestUrl,
    { method: "GET" },
    {
      policy: {
        ...getSafeUrlPolicy("pluginManifest"),
        allowedHosts: ["registry.modelcontextprotocol.io"],
      },
      timeoutMs: MANIFEST_TIMEOUT_MS,
      maxResponseBytes: MAX_MANIFEST_BYTES,
    },
  );
  if (!response.ok) throw new Error("Failed to fetch MCP registry metadata");
  const normalized = normalizeMcpRegistryServer(data);
  if (!normalized || normalized.id !== plugin.id) {
    throw new Error("MCP registry metadata did not match the requested plugin");
  }
  return normalized;
}

function getAuthType(plugin: Plugin, auth: InstallAuth) {
  if (auth?.type) return auth.type;
  if (plugin.auth?.type === "apiKey") return "apiKey";
  if (plugin.auth?.type === "oauth2") return "oauth2";
  return "bearer";
}

function getAuthKey(plugin: Plugin, auth: InstallAuth): string {
  if (auth?.key) return auth.key;
  if (plugin.auth?.name) return plugin.auth.name;
  return plugin.auth?.type === "apiKey" ? "X-API-Key" : "Authorization";
}

function getAuthConfig(plugin: Plugin, auth: InstallAuth, value: string) {
  return {
    type: getAuthType(plugin, auth),
    key: getAuthKey(plugin, auth),
    addTo: auth?.addTo || plugin.auth?.in || "header",
    value,
  };
}

function createInstalledMcpPlugin(
  plugin: Plugin,
  functions: PluginFunction[],
  discovery: McpDiscoveryResult,
): Plugin {
  const toolNameMap = Object.fromEntries(
    functions.map((item) => [item.name, item.mcpToolName || item.name]),
  );
  return {
    ...plugin,
    source: "mcp",
    category: plugin.category || "MCP",
    categories: plugin.categories?.length ? plugin.categories : ["MCP"],
    functions,
    mcp: {
      ...plugin.mcp!,
      toolNameMap,
      capabilities: discovery.capabilities,
      resources: normalizeResourceDescriptors(discovery.resources),
      resourceTemplates: normalizeResourceTemplateDescriptors(
        discovery.resourceTemplates,
      ),
      prompts: normalizePromptDescriptors(discovery.prompts),
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

function normalizeResourceDescriptors(
  resources: McpDiscoveryResult["resources"],
): McpResourceDescriptor[] {
  return resources.map((resource) => ({
    uri: resource.uri.slice(0, 2_048),
    name: resource.name.slice(0, 300),
    ...(resource.title ? { title: resource.title.slice(0, 300) } : {}),
    ...(resource.description
      ? { description: resource.description.slice(0, 2_048) }
      : {}),
    ...(resource.mimeType ? { mimeType: resource.mimeType.slice(0, 200) } : {}),
    ...(typeof resource.size === "number" && resource.size >= 0
      ? { size: resource.size }
      : {}),
  }));
}

function normalizeResourceTemplateDescriptors(
  templates: McpDiscoveryResult["resourceTemplates"],
): McpResourceTemplateDescriptor[] {
  return templates.map((template) => ({
    uriTemplate: template.uriTemplate.slice(0, 2_048),
    name: template.name.slice(0, 300),
    ...(template.title ? { title: template.title.slice(0, 300) } : {}),
    ...(template.description
      ? { description: template.description.slice(0, 2_048) }
      : {}),
    ...(template.mimeType ? { mimeType: template.mimeType.slice(0, 200) } : {}),
  }));
}

function normalizePromptDescriptors(
  prompts: McpDiscoveryResult["prompts"],
): McpPromptDescriptor[] {
  return prompts.map((prompt) => ({
    name: prompt.name.slice(0, 300),
    ...(prompt.title ? { title: prompt.title.slice(0, 300) } : {}),
    ...(prompt.description
      ? { description: prompt.description.slice(0, 2_048) }
      : {}),
    ...(prompt.arguments?.length
      ? {
          arguments: prompt.arguments.slice(0, 50).map((argument) => ({
            name: argument.name.slice(0, 300),
            ...(argument.description
              ? { description: argument.description.slice(0, 2_048) }
              : {}),
            ...(typeof argument.required === "boolean"
              ? { required: argument.required }
              : {}),
          })),
        }
      : {}),
  }));
}

async function installMcpPlugin(
  requested: Plugin,
  auth: InstallAuth,
): Promise<NextResponse> {
  const plugin = await resolveTrustedMcpPlugin(requested);
  if (!plugin.mcp?.serverUrl || !plugin.mcp.serverName) {
    return errorResponse(
      "Missing MCP server metadata",
      "MCP_SERVER_METADATA_MISSING",
    );
  }
  const authValue = await decryptOptionalSecret(
    auth?.valueSecret,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  if (isPluginAuthRequired(plugin) && !authValue) {
    return errorResponse(
      "MCP server requires authentication before tools can be listed",
      "MCP_AUTH_REQUIRED_FOR_INSTALL",
    );
  }
  const discovery = await discoverMcpServer({
    serverUrl: plugin.mcp.serverUrl,
    staticHeaders: plugin.mcp.headers,
    ...(authValue
      ? { authConfig: getAuthConfig(plugin, auth, authValue) }
      : {}),
  });
  const functions = normalizeMcpToolFunctions(
    plugin.mcp.serverName,
    discovery.tools,
  );
  if (
    functions.length === 0 &&
    discovery.resources.length === 0 &&
    discovery.resourceTemplates.length === 0 &&
    discovery.prompts.length === 0
  ) {
    return errorResponse(
      "MCP server does not expose any supported tools",
      "MCP_TOOLS_EMPTY",
    );
  }
  const installed = createInstalledMcpPlugin(plugin, functions, discovery);
  await registerServerPlugin(installed);
  return NextResponse.json({ plugin: installed });
}

async function installMarketplacePlugin(plugin: Plugin): Promise<NextResponse> {
  if (!plugin.manifestUrl) {
    return errorResponse(
      "Missing plugin manifest URL",
      "PLUGIN_MANIFEST_URL_MISSING",
    );
  }
  const spec = await fetchManifest(plugin.manifestUrl);
  const installed = convertOpenApiSpecToPlugin(
    spec as Record<string, any>,
    plugin,
    plugin.manifestUrl,
  );
  await registerServerPlugin(installed as Plugin);
  return NextResponse.json({ plugin: installed });
}

export async function handlePluginInstall(
  body: InstallBody,
): Promise<NextResponse> {
  if (body.customInput) return installCustomPlugin(body.customInput);
  if (!body.plugin) {
    return errorResponse(
      "Missing plugin or customInput",
      "PLUGIN_INSTALL_INPUT_MISSING",
    );
  }
  const plugin = body.plugin as Plugin;
  if (plugin.source === "mcp") {
    if (!plugin.id)
      return errorResponse("Missing plugin id", "PLUGIN_ID_MISSING");
    return installMcpPlugin(plugin, body.authConfig);
  }
  return installMarketplacePlugin(plugin);
}
