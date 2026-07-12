import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import type { PluginFunction } from "../../types";
import { isRegistryRecord, trimRegistryString } from "./registryRemote";

const MAX_MCP_TOOL_FUNCTIONS = 20;

export interface McpRegistryTool {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function sanitizeToolNameSegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/-+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "tool"
  );
}

export function buildMcpToolFunctionName(
  serverName: string,
  toolName: string,
): string {
  const serverSegment = sanitizeToolNameSegment(serverName);
  const toolSegment = sanitizeToolNameSegment(toolName);
  const candidate = `mcp_${serverSegment}__${toolSegment}`;
  if (candidate.length <= PLUGIN_EXECUTION_LIMITS.maxFunctionNameChars) {
    return candidate;
  }
  const suffix = `_${shortHash(`${serverName}:${toolName}`)}`;
  const maxBodyChars =
    PLUGIN_EXECUTION_LIMITS.maxFunctionNameChars - 6 - suffix.length;
  const serverChars = Math.min(
    serverSegment.length,
    Math.max(20, Math.floor(maxBodyChars * 0.48)),
  );
  const toolChars = Math.max(1, maxBodyChars - serverChars);
  return `mcp_${serverSegment.slice(0, serverChars).replace(/_+$/g, "")}__${toolSegment
    .slice(0, toolChars)
    .replace(/_+$/g, "")}${suffix}`;
}

function buildUniqueFunctionName(
  serverName: string,
  toolName: string,
  index: number,
  seen: Set<string>,
): string {
  const baseName = buildMcpToolFunctionName(serverName, toolName);
  if (!seen.has(baseName)) {
    seen.add(baseName);
    return baseName;
  }
  const hash = shortHash(`${serverName}:${toolName}:${index}`);
  const prefix = baseName
    .slice(0, PLUGIN_EXECUTION_LIMITS.maxFunctionNameChars - hash.length - 1)
    .replace(/_+$/g, "");
  const uniqueName = `${prefix}_${hash}`;
  seen.add(uniqueName);
  return uniqueName;
}

function normalizeTool(
  serverName: string,
  tool: unknown,
  index: number,
  seen: Set<string>,
): PluginFunction | null {
  if (!isRegistryRecord(tool)) return null;
  const mcpToolName = trimRegistryString(tool.name, 256);
  if (!mcpToolName) return null;
  return {
    name: buildUniqueFunctionName(serverName, mcpToolName, index, seen),
    mcpToolName,
    description:
      trimRegistryString(tool.description, 2_048) ||
      `Call the MCP tool ${mcpToolName}.`,
    parameters: isRegistryRecord(tool.inputSchema)
      ? { ...tool.inputSchema }
      : { type: "object", properties: {} },
    risk: "external",
  };
}

export function normalizeMcpToolFunctions(
  serverName: string,
  tools: McpRegistryTool[] | unknown,
): PluginFunction[] {
  if (!Array.isArray(tools)) return [];
  const seen = new Set<string>();
  const functions: PluginFunction[] = [];
  for (const [index, tool] of tools.entries()) {
    const normalized = normalizeTool(serverName, tool, index, seen);
    if (normalized) functions.push(normalized);
    if (functions.length >= MAX_MCP_TOOL_FUNCTIONS) break;
  }
  return functions;
}
