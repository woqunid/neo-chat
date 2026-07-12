import { NextResponse } from "next/server";
import type { z } from "zod";
import {
  PluginExecutionRequestSchema,
  ToolExecutionSchema,
} from "@/lib/api/schemas";
import { decryptOptionalSecret } from "../../../../lib/byok/server";
import { BYOK_CONTEXTS } from "../../../../lib/byok/shared";
import { executeMcpToolRequest } from "../../../../lib/mcp/executor";
import { isPluginAuthRequired } from "../../../../lib/plugin/config";
import { executePluginFunctionRequest } from "../../../../lib/plugin/pluginExecutionExecutor";
import {
  getServerPlugin,
  registerServerPlugin,
} from "../../../../lib/plugin/serverRegistry";
import { getDeploymentMode } from "../../../../lib/security/deployment";
import { safeFetchText } from "@/lib/security/safeFetch";
import type { Plugin, PluginFunction } from "@/types";

type ExecutionBody = z.infer<typeof PluginExecutionRequestSchema>;

function errorResponse(
  error: string,
  code: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error, code, statusCode: status }, { status });
}

function getMcpAuthType(
  plugin: Plugin,
  auth: ExecutionBody["authConfig"],
): "bearer" | "apiKey" | "none" | "oauth2" | undefined {
  if (auth?.type) return auth.type;
  const type = plugin.auth?.type;
  return type === "bearer" ||
    type === "apiKey" ||
    type === "oauth2" ||
    type === "none"
    ? type
    : undefined;
}

async function executeMcpPlugin(
  plugin: Plugin,
  functionDef: PluginFunction,
  body: ExecutionBody,
  signal: AbortSignal,
): Promise<Response> {
  if (!plugin.mcp?.serverUrl) {
    return errorResponse(
      "MCP server metadata is missing",
      "MCP_SERVER_METADATA_MISSING",
      400,
    );
  }
  const toolName =
    plugin.mcp.toolNameMap?.[body.functionName] || functionDef.mcpToolName;
  if (!toolName) {
    return errorResponse(
      "MCP tool mapping is missing",
      "MCP_TOOL_MAPPING_MISSING",
      400,
    );
  }
  const authValue = await decryptOptionalSecret(
    body.authConfig?.valueSecret,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  if (isPluginAuthRequired(plugin) && !authValue) {
    return errorResponse(
      "Plugin authentication is required",
      "PLUGIN_AUTH_REQUIRED",
      400,
    );
  }
  const result = await executeMcpToolRequest({
    serverUrl: plugin.mcp.serverUrl,
    toolName,
    args: body.args,
    staticHeaders: plugin.mcp.headers,
    authValue,
    authConfig: {
      type: getMcpAuthType(plugin, body.authConfig),
      key: body.authConfig?.key || plugin.auth?.name,
      addTo: body.authConfig?.addTo || plugin.auth?.in,
    },
    signal,
  });
  return NextResponse.json({ result });
}

function resolvePluginForExecution(
  plugin: Plugin,
  body: ExecutionBody,
): Plugin {
  if (body.pluginId !== "unsplash" || body.authConfig?.valueSecret)
    return plugin;
  return { ...plugin, baseUrl: "https://unsplash.com/napi" };
}

async function executeRegistered(
  body: ExecutionBody,
  signal: AbortSignal,
): Promise<Response> {
  const registered = await getServerPlugin(body.pluginId);
  if (!registered) {
    return errorResponse(
      "Plugin is not registered on the server",
      "PLUGIN_NOT_REGISTERED",
      404,
    );
  }
  const functionDef = registered.functions?.find(
    (item) => item.name === body.functionName,
  );
  if (!functionDef) {
    return errorResponse(
      "Plugin function is not declared by this plugin",
      "PLUGIN_FUNCTION_NOT_FOUND",
      400,
    );
  }
  const plugin = resolvePluginForExecution(registered, body);
  if (plugin.source === "mcp") {
    return executeMcpPlugin(plugin, functionDef, body, signal);
  }
  return executePluginFunctionRequest({
    plugin,
    functionDef,
    args: body.args,
    authConfig: body.authConfig,
    decryptSecret: decryptOptionalSecret,
    fetchText: safeFetchText,
    signal,
  });
}

async function registerLegacyPlugin(plugin: Plugin): Promise<void> {
  try {
    await registerServerPlugin(plugin);
  } catch (error) {
    const reservedId =
      error instanceof Error &&
      /reserved built-in plugin id/i.test(error.message);
    if (!reservedId) throw error;
  }
}

async function executeLegacy(
  rawBody: unknown,
  signal: AbortSignal,
): Promise<Response> {
  if (
    getDeploymentMode() === "hosted" &&
    ToolExecutionSchema.safeParse(rawBody).success
  ) {
    return errorResponse(
      "Legacy plugin execution payloads are disabled in hosted mode",
      "LEGACY_PLUGIN_PAYLOAD_DISABLED",
      403,
    );
  }
  const body = ToolExecutionSchema.parse(rawBody);
  const plugin = body.plugin as Plugin;
  await registerLegacyPlugin(plugin);
  return executePluginFunctionRequest({
    plugin,
    functionDef: body.functionDef as PluginFunction,
    args: body.args,
    authConfig: body.authConfig,
    decryptSecret: decryptOptionalSecret,
    fetchText: safeFetchText,
    signal,
  });
}

export async function handlePluginExecution(
  rawBody: unknown,
  signal: AbortSignal,
): Promise<Response> {
  const parsed = PluginExecutionRequestSchema.safeParse(rawBody);
  return parsed.success
    ? executeRegistered(parsed.data, signal)
    : executeLegacy(rawBody, signal);
}
