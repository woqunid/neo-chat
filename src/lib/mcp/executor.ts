import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { callMcpTool, type McpAuthConfig } from "./client";
import { validateMcpSchemaValue } from "./schemaValidation";

export interface ExecuteMcpToolRequestOptions {
  serverUrl: string;
  toolName: string;
  args: Record<string, unknown>;
  authConfig?: McpAuthConfig;
  authValue?: string;
  staticHeaders?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  sessionKey?: string;
  roots?: Array<{ uri: string; name?: string }>;
  outputSchema?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getMcpToolErrorMessage(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((item) =>
      isRecord(item) && typeof item.text === "string" ? item.text.trim() : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();

  if (text) return text.slice(0, 4_000);
  if (typeof result.message === "string" && result.message.trim()) {
    return result.message.trim().slice(0, 4_000);
  }
  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim().slice(0, 4_000);
  }
  return "MCP tool returned an error.";
}

function compactMcpResult(result: unknown): unknown {
  if (isRecord(result) && result.isError === true) {
    return { error: getMcpToolErrorMessage(result) };
  }

  try {
    const serialized = JSON.stringify(result);
    if (
      !serialized ||
      serialized.length <= PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars
    ) {
      return result;
    }

    return {
      content: [
        {
          type: "text",
          text: `${serialized.slice(
            0,
            PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars,
          )}...`,
        },
      ],
      truncated: true,
    };
  } catch {
    return {
      error: "MCP tool returned an unserializable result.",
    };
  }
}

function getStructuredContent(result: unknown): unknown {
  return isRecord(result) ? result.structuredContent : undefined;
}

function normalizeMcpContentResult(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) return result;
  const images: Array<{
    imageBase64?: string;
    imageUrl?: string;
    mimeType?: string;
  }> = [];
  const audio: Array<{ audioBase64: string; mimeType?: string }> = [];
  const resources: unknown[] = [];
  const content = result.content.map((item) => {
    if (!isRecord(item) || typeof item.type !== "string") return item;
    if (item.type === "image" && typeof item.data === "string") {
      images.push({
        imageBase64: item.data,
        ...(typeof item.mimeType === "string"
          ? { mimeType: item.mimeType }
          : {}),
      });
      return { ...item, data: "[image extracted]" };
    }
    if (item.type === "audio" && typeof item.data === "string") {
      audio.push({
        audioBase64: item.data,
        ...(typeof item.mimeType === "string"
          ? { mimeType: item.mimeType }
          : {}),
      });
      return { ...item, data: "[audio extracted]" };
    }
    if (item.type === "resource" || item.type === "resource_link") {
      resources.push(item);
    }
    return item;
  });
  return {
    ...result,
    content,
    ...(images.length ? { images } : {}),
    ...(audio.length ? { audio } : {}),
    ...(resources.length ? { resources } : {}),
  };
}

export async function executeMcpToolRequest(
  options: ExecuteMcpToolRequestOptions,
): Promise<unknown> {
  const result = await callMcpTool({
    serverUrl: options.serverUrl,
    toolName: options.toolName,
    args: options.args,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    sessionKey: options.sessionKey,
    roots: options.roots,
    staticHeaders: options.staticHeaders,
    authConfig: {
      ...options.authConfig,
      value: options.authValue,
    },
  });

  const structuredContent = getStructuredContent(result);
  if (structuredContent !== undefined && options.outputSchema) {
    const validationError = validateMcpSchemaValue(
      options.outputSchema,
      structuredContent,
      "工具结果",
    );
    if (validationError) {
      return { error: `MCP 工具结果不符合 outputSchema：${validationError}` };
    }
  }

  return compactMcpResult(normalizeMcpContentResult(result));
}
