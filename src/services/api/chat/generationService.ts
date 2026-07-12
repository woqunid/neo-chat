import type { ModelProvider, ToolCall } from "@/types";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { parseModelString } from "@/lib/utils/model";
import {
  getResponseErrorMessage,
  signedApiFetch,
} from "../../../lib/api/client";
import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "../../../lib/byok/client";
import { logDevError, logDevWarn } from "../../../lib/utils/devLogger";
import type { ChatToolDefinition } from "./types";

function resolveProvider(model: string): {
  provider?: ModelProvider;
  modelName: string;
} {
  const { providerId, modelName } = parseModelString(model);
  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((item) => item.id === providerId)
    : providers.find((item) => item.enabled);
  return { provider, modelName };
}

function eventData(event: string): string {
  return event
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
}

async function requestGeneration(options: {
  provider: ModelProvider;
  modelName: string;
  prompt: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetchWithByokRetry(async () =>
    signedApiFetch("/api/chat/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(options.provider),
        modelName: options.modelName,
        prompt: options.prompt,
      }),
      signal: options.signal,
    }),
  );
}

function consumeContentEvent(
  data: string,
  current: string,
  onChunk: (text: string) => void,
): { text: string; done: boolean } {
  if (!data || data === "[DONE]") return { text: current, done: false };
  const parsed = JSON.parse(data);
  if (parsed.type === "error") throw new Error(parsed.error);
  if (parsed.type === "done") return { text: current, done: true };
  if (parsed.type !== "content") return { text: current, done: false };
  const text = current + parsed.content;
  onChunk(text);
  return { text, done: false };
}

function processContentEvents(
  events: string[],
  current: string,
  onChunk: (text: string) => void,
): { text: string; done: boolean } {
  let text = current;
  for (const event of events) {
    try {
      const result = consumeContentEvent(eventData(event), text, onChunk);
      text = result.text;
      if (result.done) return result;
    } catch (error) {
      if (event.includes('"type":"error"')) throw error;
      logDevError("Failed to parse SSE data:", error);
    }
  }
  return { text, done: false };
}

async function readContentStream(
  response: Response,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    const result = processContentEvents(events, text, onChunk);
    text = result.text;
    if (result.done) return text;
  }
  return text;
}

interface StreamGenerationOptions {
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}

type StreamGenerationInput =
  StreamGenerationOptions | StreamGenerationOptions["onChunk"];

function resolveStreamGenerationOptions(
  input: StreamGenerationInput,
): StreamGenerationOptions {
  return typeof input === "function" ? { onChunk: input } : input;
}

export async function streamGenerateContent(
  model: string,
  prompt: string,
  input: StreamGenerationInput,
): Promise<string> {
  const options = resolveStreamGenerationOptions(input);
  const { provider, modelName } = resolveProvider(model);
  if (!provider) throw new Error("No provider found");
  try {
    const response = await requestGeneration({
      provider,
      modelName,
      prompt,
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Generate request failed"),
      );
    }
    return await readContentStream(response, options.onChunk);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    logDevError("Stream generate error:", error);
    throw error;
  }
}

async function requestToolSelection(options: {
  provider: ModelProvider;
  modelName: string;
  prompt: string;
  tools: ChatToolDefinition[];
  signal?: AbortSignal;
}): Promise<Response> {
  return fetchWithByokRetry(async () =>
    signedApiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(options.provider),
        modelName: options.modelName,
        history: [],
        newMessage: options.prompt,
        attachments: [],
        config: { temperature: 0 },
        tools: options.tools,
      }),
      signal: options.signal,
    }),
  );
}

function parseToolEvent(event: string): ToolCall | null | undefined {
  const data = eventData(event);
  if (!data || data === "[DONE]") return undefined;
  const parsed = JSON.parse(data);
  if (parsed.type === "tool_call") return parsed.toolCall || null;
  if (parsed.type === "error") throw new Error(parsed.error);
  if (parsed.type === "done") return null;
  return undefined;
}

async function readToolStream(response: Response): Promise<ToolCall | null> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const event of events) {
      const result = parseToolEvent(event);
      if (result === undefined) continue;
      await reader.cancel().catch(() => undefined);
      return result;
    }
  }
  return buffer.trim() ? (parseToolEvent(buffer) ?? null) : null;
}

interface ToolGenerationOptions {
  tools: ChatToolDefinition[];
  signal?: AbortSignal;
}

export async function streamGenerateToolCall(
  model: string,
  prompt: string,
  options: ToolGenerationOptions,
): Promise<ToolCall | null> {
  if (options.tools.length === 0) return null;
  const { provider, modelName } = resolveProvider(model);
  if (!provider) {
    logDevWarn("Skill tool selection skipped: no provider found.");
    return null;
  }
  try {
    const response = await requestToolSelection({
      provider,
      modelName,
      prompt,
      tools: options.tools,
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Tool selection failed"),
      );
    }
    return await readToolStream(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    logDevWarn("Skill tool selection failed:", error);
    return null;
  }
}
