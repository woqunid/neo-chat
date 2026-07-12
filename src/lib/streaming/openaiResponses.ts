import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { IncompleteProviderStreamError } from "../errors";
import type { OpenAIResponsesStreamOptions } from "./openai";
import {
  createOpenAIStreamRequest,
  emitOpenAIImage,
  emitStreamTiming,
  extractOpenAIText,
  extractReasoningSummary,
} from "./openaiShared";
import type { SSEMessage } from "./sse";
import { finalizeStreamedToolCall } from "./toolCalls";

const MODE_MISMATCH_ERROR =
  "Provider returned Chat Completions data to an OpenAI Responses request. Change its API type to OpenAI Compatible.";
const EMPTY_OUTPUT_ERROR =
  "OpenAI Responses stream completed without output. This provider may only support Chat Completions; change its API type to OpenAI Compatible.";

interface ResponsesState {
  toolCallPosition: number;
  hasOutputText: boolean;
  hasReasoning: boolean;
  hasToolCall: boolean;
  hasImage: boolean;
  receivedCompleted: boolean;
}

function createResponsesState(): ResponsesState {
  return {
    toolCallPosition: 0,
    hasOutputText: false,
    hasReasoning: false,
    hasToolCall: false,
    hasImage: false,
    receivedCompleted: false,
  };
}

function createRequestParams(options: OpenAIResponsesStreamOptions): any {
  const params: any = {
    model: options.model,
    input: options.input,
    stream: true,
  };
  if (options.instructions) params.instructions = options.instructions;
  if (options.temperature !== undefined)
    params.temperature = options.temperature;
  const tools = options.tools ? [...options.tools] : [];
  if (
    options.enableImageGeneration &&
    !tools.some((tool) => tool?.type === "image_generation")
  ) {
    tools.push({ type: "image_generation" });
  }
  if (tools.length) params.tools = tools;
  return params;
}

function handleTextDelta(
  event: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  const text = extractOpenAIText(event.delta);
  if (!text) return;
  const isReasoning =
    event.type === "response.reasoning_summary_text.delta" ||
    event.type === "response.reasoning_text.delta";
  if (isReasoning) state.hasReasoning = true;
  else state.hasOutputText = true;
  onChunk({ type: isReasoning ? "reasoning" : "content", content: text });
}

function handleMessageItem(
  item: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (state.hasOutputText) return;
  for (const content of Array.isArray(item.content) ? item.content : []) {
    const text = extractOpenAIText(content?.text);
    if (!text) continue;
    state.hasOutputText = true;
    onChunk({ type: "content", content: text });
  }
}

function handleFunctionCall(
  item: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (state.toolCallPosition >= PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls) {
    return;
  }
  const position = state.toolCallPosition;
  state.toolCallPosition += 1;
  const toolCall = finalizeStreamedToolCall(
    {
      id: item.call_id || item.id,
      name: item.name,
      argsText: item.arguments,
    },
    position,
  );
  if (!toolCall) return;
  state.hasToolCall = true;
  onChunk({ type: "tool_call", toolCall });
}

function handleOutputItem(
  item: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (item?.type === "reasoning") {
    if (state.hasReasoning) return;
    const text = extractReasoningSummary(item);
    if (!text) return;
    state.hasReasoning = true;
    onChunk({ type: "reasoning", content: text });
    return;
  }
  if (item?.type === "message") return handleMessageItem(item, state, onChunk);
  if (item?.type === "function_call") {
    handleFunctionCall(item, state, onChunk);
  }
}

function handleCompleted(
  event: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  state.receivedCompleted = true;
  if (!state.hasOutputText) {
    const text = extractOpenAIText(
      (event.response?.output || []).filter(
        (item: any) => item?.type === "message",
      ),
    );
    if (text) {
      state.hasOutputText = true;
      onChunk({ type: "content", content: text });
    }
  }
  const usage = event.response?.usage;
  if (!usage) return;
  onChunk({
    type: "usage",
    usage: {
      prompt_tokens: usage.input_tokens ?? 0,
      completion_tokens: usage.output_tokens ?? 0,
      total_tokens: usage.total_tokens ?? 0,
    },
  });
}

function throwResponsesTerminalError(event: any): never {
  const message =
    event.error?.message ||
    event.response?.error?.message ||
    event.message ||
    event.response?.incomplete_details?.reason ||
    "upstream terminal error";
  throw new Error(`OpenAI Responses stream failed: ${message}`);
}

type ResponseEventHandler = (
  event: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
) => void;

const handleImageEvent: ResponseEventHandler = (event, state, onChunk) => {
  state.hasImage = emitOpenAIImage(event, onChunk) || state.hasImage;
};

const RESPONSE_EVENT_HANDLERS: Record<string, ResponseEventHandler> = {
  "response.output_text.delta": handleTextDelta,
  "response.reasoning_summary_text.delta": handleTextDelta,
  "response.reasoning_text.delta": handleTextDelta,
  "response.refusal.delta": handleTextDelta,
  "response.output_item.done": (event, state, onChunk) =>
    handleOutputItem(event.item, state, onChunk),
  "response.image_generation_call.completed": handleImageEvent,
  "response.completed": handleCompleted,
  "response.failed": throwResponsesTerminalError,
  "response.error": throwResponsesTerminalError,
  "response.incomplete": throwResponsesTerminalError,
  error: throwResponsesTerminalError,
};

function handleEvent(
  event: any,
  state: ResponsesState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (Array.isArray(event?.choices)) {
    throw new Error(MODE_MISMATCH_ERROR);
  }
  const handler = RESPONSE_EVENT_HANDLERS[event?.type];
  if (handler) {
    handler(event, state, onChunk);
  }
}

function assertCompleteResponsesStream(state: ResponsesState): void {
  if (!state.receivedCompleted) {
    throw new IncompleteProviderStreamError(
      "OpenAI Responses stream ended before response.completed.",
    );
  }
  if (
    !state.hasOutputText &&
    !state.hasReasoning &&
    !state.hasToolCall &&
    !state.hasImage
  ) {
    throw new Error(EMPTY_OUTPUT_ERROR);
  }
}

export async function streamOpenAIResponsesApi(
  options: OpenAIResponsesStreamOptions,
): Promise<void> {
  const startTime = Date.now();
  const stream = (await createOpenAIStreamRequest(
    options.client.responses.create.bind(options.client.responses),
    createRequestParams(options),
    options.signal,
  )) as AsyncIterable<any>;
  const state = createResponsesState();
  for await (const event of stream) {
    handleEvent(event, state, options.onChunk);
  }
  assertCompleteResponsesStream(state);
  emitStreamTiming(startTime, options.onChunk);
}
