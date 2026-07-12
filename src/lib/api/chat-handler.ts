/**
 * 统一的聊天处理器
 */

import type { Message } from "@/types";
import type { ProviderConfig } from "../providers/base";
import {
  createStreamHandler,
  createStreamResponse,
  createSSESender,
} from "../streaming/sse";
import {
  getProviderBaseUrlHost,
  streamProviderResponse,
} from "./chat-provider-streams";
import { ApiError, ProviderError } from "../errors";
import { safeServerLogError } from "../utils/safeServerLog";

export interface ChatHandlerOptions {
  provider: ProviderConfig;
  modelName: string;
  history: Message[];
  newMessage: string;
  attachments?: any[];
  config?: {
    temperature?: number;
    imageCount?: number;
  };
  systemInstruction?: string;
  tools?: any[];
  enableImageGeneration?: boolean;
  signal?: AbortSignal;
}

function getErrorStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getErrorNumberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getChatStreamErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};

  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    status:
      getErrorNumberField(record, "status") ||
      getErrorNumberField(record, "statusCode"),
    code: getErrorStringField(record, "code"),
    type: getErrorStringField(record, "type"),
  };
}

function logChatStreamError(error: unknown, options: ChatHandlerOptions): void {
  safeServerLogError("Chat stream error:", {
    providerType: options.provider.type,
    providerBaseUrlHost: getProviderBaseUrlHost(options.provider),
    modelName: options.modelName,
    error: getChatStreamErrorDetails(error),
  });
}

function getProviderErrorMessage(
  details: ReturnType<typeof getChatStreamErrorDetails>,
) {
  const status = details.status ? `status_code=${details.status}, ` : "";
  return `Provider request failed: ${status}${details.message}`;
}

function toChatStreamPublicError(
  error: unknown,
  options: ChatHandlerOptions,
): Error {
  if (error instanceof ApiError) return error;

  const details = getChatStreamErrorDetails(error);
  return new ProviderError(
    getProviderErrorMessage(details),
    options.provider.type,
    {
      providerType: options.provider.type,
      providerBaseUrlHost: getProviderBaseUrlHost(options.provider),
      modelName: options.modelName,
      status: details.status,
      code: details.code,
      type: details.type,
    },
  );
}

/**
 * 处理聊天请求（流式）
 */
export async function handleChatStream(options: ChatHandlerOptions) {
  const stream = createStreamHandler(async (controller) => {
    try {
      options.signal?.throwIfAborted();
      const send = createSSESender(controller);
      await streamProviderResponse(options, send);
      options.signal?.throwIfAborted();
      send({ type: "done" });
    } catch (error) {
      logChatStreamError(error, options);
      throw toChatStreamPublicError(error, options);
    }
  });

  return createStreamResponse(stream);
}
