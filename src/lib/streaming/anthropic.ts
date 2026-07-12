import type { ProviderConfig } from "../providers/base";
import {
  getProviderApiKey,
  normalizeProviderBaseUrl,
} from "../security/urlPolicy";
import type { SSEMessage } from "./sse";
import {
  createProviderTimeoutSignal,
  getChatProviderTimeoutMs,
} from "../providers/requestTimeout";
import {
  assertAnthropicStreamCompleted,
  createAnthropicStreamState,
  handleAnthropicStreamPayload,
} from "./anthropicStreamEvents";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicStreamOptions {
  provider: ProviderConfig;
  model: string;
  messages: any[];
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
  onChunk: (message: SSEMessage) => void;
}

function getMessagesEndpoint(provider: ProviderConfig): string {
  return `${normalizeProviderBaseUrl(provider.baseUrl, "Anthropic")}/messages`;
}

function convertTools(tools?: any[]) {
  return tools
    ?.map((tool) => {
      const fn = tool?.function;
      if (tool?.type !== "function" || !fn?.name) return null;
      return {
        name: fn.name,
        description: fn.description || "",
        input_schema: fn.parameters || { type: "object", properties: {} },
      };
    })
    .filter(Boolean);
}

async function readErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

function createRequestBody(options: AnthropicStreamOptions, stream: boolean) {
  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: DEFAULT_MAX_TOKENS,
    messages: options.messages,
    stream,
  };
  if (options.systemInstruction) body.system = options.systemInstruction;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  const tools = convertTools(options.tools);
  if (tools && tools.length > 0) body.tools = tools;
  return body;
}

async function createAnthropicResponse(options: AnthropicStreamOptions) {
  const apiKey = getProviderApiKey(options.provider);
  if (!apiKey) throw new Error("Anthropic API key is not configured");
  const timeoutMs = getChatProviderTimeoutMs();

  const response = await fetch(getMessagesEndpoint(options.provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(createRequestBody(options, true)),
    ...(timeoutMs > 0
      ? { signal: createProviderTimeoutSignal(timeoutMs) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic request failed: ${await readErrorResponse(response)}`,
    );
  }
  if (!response.body) throw new Error("Anthropic response body is empty");
  return response;
}

function getOutputText(data: any): string {
  const content = Array.isArray(data?.content) ? data.content : [];
  return content
    .map((item: any) => (item?.type === "text" ? item.text : ""))
    .join("");
}

export async function generateAnthropicMessage(
  options: Omit<AnthropicStreamOptions, "onChunk">,
): Promise<string> {
  const apiKey = getProviderApiKey(options.provider);
  if (!apiKey) throw new Error("Anthropic API key is not configured");
  const timeoutMs = getChatProviderTimeoutMs();

  const response = await fetch(getMessagesEndpoint(options.provider), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": ANTHROPIC_VERSION,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(
      createRequestBody({ ...options, onChunk: () => undefined }, false),
    ),
    ...(timeoutMs > 0
      ? { signal: createProviderTimeoutSignal(timeoutMs) }
      : {}),
  });

  if (!response.ok) {
    throw new Error(
      `Anthropic request failed: ${await readErrorResponse(response)}`,
    );
  }

  return getOutputText(await response.json());
}

function parseSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  return { events: parts.slice(0, -1), rest: parts.at(-1) || "" };
}

function getEventData(event: string): unknown | null {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  return data ? JSON.parse(data) : null;
}

export async function streamAnthropicMessages(options: AnthropicStreamOptions) {
  const startTime = Date.now();
  const response = await createAnthropicResponse(options);
  const body = response.body;
  if (!body) throw new Error("Anthropic response body is empty");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let state = createAnthropicStreamState();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseEvents(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      const payload = getEventData(event);
      if (payload) {
        state = handleAnthropicStreamPayload(payload, state, options.onChunk);
      }
    }
  }

  assertAnthropicStreamCompleted(state);
  const endTime = Date.now();
  options.onChunk({
    type: "timing",
    timing: { startTime, endTime, duration: endTime - startTime },
  });
}
