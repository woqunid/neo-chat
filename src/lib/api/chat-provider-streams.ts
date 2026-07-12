import type { ChatHandlerOptions } from "./chat-handler";
import { ProviderFactory, type ProviderConfig } from "../providers/base";
import {
  ANTHROPIC_PROVIDER_TYPE,
  OPENAI_COMPATIBLE_PROVIDER_TYPE,
} from "../providers/providerTypes";
import { streamAnthropicMessages } from "../streaming/anthropic";
import { streamGeminiResponse } from "../streaming/gemini";
import {
  streamOpenAIChatCompletions,
  streamOpenAIResponses,
} from "../streaming/openai";
import type { SSEMessage } from "../streaming/sse";
import {
  prepareAnthropicMessages,
  prepareGeminiHistory,
  prepareOpenAIHistory,
  prepareOpenAIResponsesInput,
} from "../utils/history";
import {
  convertAttachmentsToAnthropic,
  convertAttachmentsToOpenAIResponses,
} from "../utils/attachments";
import { convertSchemaToGemini } from "../utils/schema";
import { logDevWarn } from "../utils/devLogger";
import {
  createTranscriptChatMessages,
  requiresTranscriptHistory,
} from "./openaiCompatibleHistory";

type StreamSender = (message: SSEMessage) => void;

export function getProviderBaseUrlHost(
  provider: ProviderConfig,
): string | undefined {
  const baseUrl = ProviderFactory.getEffectiveBaseUrl(
    provider.baseUrl,
    provider.type,
  );
  if (!baseUrl) return undefined;

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function appendImageCountInstruction(
  instruction: string | undefined,
  imageCount: number | undefined,
): string | undefined {
  if (!imageCount) return instruction;
  const suffix = imageCount === 1 ? "" : "s";
  const imageInstruction =
    `When generating images for this request, create ${imageCount} ` +
    `separate image output${suffix}.`;
  return instruction
    ? `${instruction}\n\n${imageInstruction}`
    : imageInstruction;
}

function convertToolsToOpenAIResponses(tools?: any[]) {
  return tools
    ?.map((tool) => {
      const fn = tool?.function;
      if (tool?.type !== "function" || !fn?.name) return null;
      return {
        type: "function",
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters || { type: "object", properties: {} },
        strict: false,
      };
    })
    .filter(Boolean);
}

function prepareOpenAICompatibleMessages(options: ChatHandlerOptions) {
  const { history, newMessage, attachments, systemInstruction } = options;
  const messages = prepareOpenAIHistory(history);
  const content: any[] = [{ type: "text", text: newMessage }];
  if (attachments?.length) content.push(...attachments);
  messages.push({ role: "user", content });
  if (systemInstruction) {
    messages.unshift({ role: "system", content: systemInstruction });
  }
  return messages;
}

async function streamAnthropic(
  options: ChatHandlerOptions,
  send: StreamSender,
): Promise<void> {
  const { provider, history, newMessage, attachments } = options;
  await ProviderFactory.assertProviderOutboundAllowed(provider, options.signal);
  const messages = prepareAnthropicMessages(history);
  const content: any[] = [{ type: "text", text: newMessage }];
  if (attachments?.length) {
    content.push(...convertAttachmentsToAnthropic(attachments));
  }
  messages.push({ role: "user", content });
  await streamAnthropicMessages({
    provider,
    model: options.modelName,
    messages,
    systemInstruction: options.systemInstruction,
    temperature: options.config?.temperature,
    tools: options.tools,
    signal: options.signal,
    onChunk: send,
  });
}

async function streamOpenAI(
  options: ChatHandlerOptions,
  send: StreamSender,
): Promise<void> {
  const { provider, history, newMessage, attachments } = options;
  await ProviderFactory.assertProviderOutboundAllowed(provider, options.signal);
  const input = prepareOpenAIResponsesInput(history);
  const content: any[] = [{ type: "input_text", text: newMessage }];
  if (attachments?.length) {
    content.push(...convertAttachmentsToOpenAIResponses(attachments));
  }
  input.push({ role: "user", content });
  await streamOpenAIResponses({
    client: ProviderFactory.createOpenAIClient(provider),
    model: options.modelName,
    input,
    instructions: appendImageCountInstruction(
      options.systemInstruction,
      options.enableImageGeneration ? options.config?.imageCount : undefined,
    ),
    temperature: options.config?.temperature,
    tools: convertToolsToOpenAIResponses(options.tools),
    enableImageGeneration: options.enableImageGeneration,
    signal: options.signal,
    onChunk: send,
  });
}

function getCompatibleMessages(options: ChatHandlerOptions) {
  const host = getProviderBaseUrlHost(options.provider);
  if (!requiresTranscriptHistory(host)) {
    return prepareOpenAICompatibleMessages(options);
  }
  return createTranscriptChatMessages({
    history: options.history,
    newMessage: options.newMessage,
    attachments: options.attachments,
    systemInstruction: options.systemInstruction,
  });
}

async function streamOpenAICompatible(
  options: ChatHandlerOptions,
  send: StreamSender,
): Promise<void> {
  await ProviderFactory.assertProviderOutboundAllowed(
    options.provider,
    options.signal,
  );
  await streamOpenAIChatCompletions({
    client: ProviderFactory.createOpenAIClient(options.provider),
    model: options.modelName,
    messages: getCompatibleMessages(options),
    temperature: options.config?.temperature,
    tools: options.tools,
    signal: options.signal,
    onChunk: send,
  });
}

function convertGeminiAttachment(attachment: any): any | null {
  if (attachment.fileData || attachment.inlineData) return attachment;
  if (attachment.url && !attachment.data) {
    return {
      fileData: {
        mimeType: attachment.mimeType,
        fileUri: attachment.url,
      },
    };
  }
  if (attachment.data) {
    return {
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.data,
      },
    };
  }
  logDevWarn("Skipping invalid attachment:", {
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
  });
  return null;
}

function createGeminiContents(options: ChatHandlerOptions) {
  const contents = prepareGeminiHistory(options.history);
  const parts: any[] = [{ text: options.newMessage }];
  if (options.attachments?.length) {
    parts.push(
      ...options.attachments.map(convertGeminiAttachment).filter(Boolean),
    );
  }
  contents.push({ role: "user", parts });
  return contents;
}

async function streamGemini(
  options: ChatHandlerOptions,
  send: StreamSender,
): Promise<void> {
  await ProviderFactory.assertProviderOutboundAllowed(
    options.provider,
    options.signal,
  );
  const tools = options.tools?.map((tool: any) => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: convertSchemaToGemini(tool.function.parameters),
  }));
  await streamGeminiResponse({
    client: ProviderFactory.createGeminiClient(options.provider),
    model: options.modelName,
    contents: createGeminiContents(options),
    systemInstruction: options.systemInstruction,
    temperature: options.config?.temperature,
    tools,
    enableImageGeneration: options.enableImageGeneration,
    imageCount: options.config?.imageCount,
    signal: options.signal,
    onChunk: send,
  });
}

export async function streamProviderResponse(
  options: ChatHandlerOptions,
  send: StreamSender,
): Promise<void> {
  if (options.provider.type === ANTHROPIC_PROVIDER_TYPE) {
    return streamAnthropic(options, send);
  }
  if (options.provider.type === "OpenAI") {
    return streamOpenAI(options, send);
  }
  if (options.provider.type === OPENAI_COMPATIBLE_PROVIDER_TYPE) {
    return streamOpenAICompatible(options, send);
  }
  return streamGemini(options, send);
}
