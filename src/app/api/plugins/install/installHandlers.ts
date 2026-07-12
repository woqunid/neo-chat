import { NextResponse } from "next/server";
import type { z } from "zod";
import { PluginInstallSchema } from "@/lib/api/schemas";
import { decryptOptionalSecret } from "../../../../lib/byok/server";
import { BYOK_CONTEXTS } from "../../../../lib/byok/shared";
import { listMcpTools } from "@/lib/mcp/client";
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
import type { Plugin, PluginFunction } from "@/types";

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

function getAuthConfig(plugin: Plugin, auth: InstallAuth, value: string) {
  const type =
    auth?.type ||
    (plugin.auth?.type === "apiKey"
      ? "apiKey"
      : plugin.auth?.type === "oauth2"
        ? "oauth2"
        : "bearer");
  return {
    type,
    key:
      auth?.key ||
      plugin.auth?.name ||
      (plugin.auth?.type === "apiKey" ? "X-API-Key" : "Authorization"),
    addTo: auth?.addTo || plugin.auth?.in || "header",
    value,
  };
}

function createInstalledMcpPlugin(
  plugin: Plugin,
  functions: PluginFunction[],
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
    mcp: { ...plugin.mcp!, toolNameMap },
  };
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
  const tools = await listMcpTools({
    serverUrl: plugin.mcp.serverUrl,
    staticHeaders: plugin.mcp.headers,
    ...(authValue
      ? { authConfig: getAuthConfig(plugin, auth, authValue) }
      : {}),
  });
  const functions = normalizeMcpToolFunctions(plugin.mcp.serverName, tools);
  if (functions.length === 0) {
    return errorResponse(
      "MCP server does not expose any supported tools",
      "MCP_TOOLS_EMPTY",
    );
  }
  const installed = createInstalledMcpPlugin(plugin, functions);
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
