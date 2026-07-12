import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { IncompleteProviderStreamError } from "../errors";
import type { SSEMessage } from "./sse";
import { finalizeStreamedToolCall } from "./toolCalls";

type PendingToolUse = {
  readonly id: string;
  readonly name: string;
  readonly args?: unknown;
  readonly argsText: string;
};

export type AnthropicStreamState = {
  readonly tools: ReadonlyMap<number, PendingToolUse>;
  readonly emittedTools: number;
  readonly inputTokens: number;
  readonly receivedMessageStop: boolean;
};

export function createAnthropicStreamState(): AnthropicStreamState {
  return {
    tools: new Map(),
    emittedTools: 0,
    inputTokens: 0,
    receivedMessageStop: false,
  };
}

function getInputTokens(usage: any): number {
  return (
    Number(usage?.input_tokens || 0) +
    Number(usage?.cache_creation_input_tokens || 0) +
    Number(usage?.cache_read_input_tokens || 0)
  );
}

function appendToolInput(
  tool: PendingToolUse,
  partialJson: unknown,
): PendingToolUse {
  if (typeof partialJson !== "string" || !partialJson) return tool;
  if (
    tool.argsText.length + partialJson.length >
    PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars
  ) {
    throw new Error("Anthropic tool call arguments are too large");
  }
  return { ...tool, argsText: tool.argsText + partialJson };
}

function emitToolUse(
  tool: PendingToolUse,
  position: number,
  onChunk: (message: SSEMessage) => void,
): void {
  const toolCall = finalizeStreamedToolCall(
    {
      id: tool.id,
      name: tool.name,
      args: tool.args,
      argsText: tool.argsText || undefined,
    },
    position,
  );
  if (toolCall) onChunk({ type: "tool_call", toolCall });
}

function emitUsage(
  inputTokens: number,
  usage: any,
  onChunk: (message: SSEMessage) => void,
): void {
  if (!usage) return;
  const outputTokens = Number(usage.output_tokens || 0);
  onChunk({
    type: "usage",
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  });
}

function handleToolStart(
  payload: any,
  state: AnthropicStreamState,
): AnthropicStreamState {
  const block = payload.content_block;
  if (block?.type !== "tool_use") return state;
  const tools = new Map(state.tools);
  tools.set(payload.index, {
    id: block.id,
    name: block.name,
    args: block.input,
    argsText: "",
  });
  return { ...state, tools };
}

function handleBlockDelta(
  payload: any,
  state: AnthropicStreamState,
  onChunk: (message: SSEMessage) => void,
): AnthropicStreamState {
  const delta = payload.delta;
  if (delta?.type === "text_delta") {
    onChunk({ type: "content", content: delta.text || "" });
    return state;
  }
  if (delta?.type === "thinking_delta") {
    onChunk({ type: "reasoning", content: delta.thinking || "" });
    return state;
  }
  if (delta?.type !== "input_json_delta") return state;
  const tool = state.tools.get(payload.index);
  if (!tool) throw new Error("Anthropic tool input arrived out of order");
  const tools = new Map(state.tools);
  tools.set(payload.index, appendToolInput(tool, delta.partial_json));
  return { ...state, tools };
}

function handleBlockStop(
  payload: any,
  state: AnthropicStreamState,
  onChunk: (message: SSEMessage) => void,
): AnthropicStreamState {
  const tool = state.tools.get(payload.index);
  const tools = new Map(state.tools);
  tools.delete(payload.index);
  if (
    !tool ||
    state.emittedTools >= PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls
  ) {
    return { ...state, tools };
  }
  emitToolUse(tool, state.emittedTools, onChunk);
  return { ...state, tools, emittedTools: state.emittedTools + 1 };
}

type PayloadHandler = (
  payload: any,
  state: AnthropicStreamState,
  onChunk: (message: SSEMessage) => void,
) => AnthropicStreamState;

const PAYLOAD_HANDLERS: Record<string, PayloadHandler> = {
  error: (payload) => {
    throw new Error(
      `Anthropic stream failed: ${payload.error?.message || "upstream terminal error"}`,
    );
  },
  message_start: (payload, state) => ({
    ...state,
    inputTokens: getInputTokens(payload.message?.usage),
  }),
  content_block_start: (payload, state) => handleToolStart(payload, state),
  content_block_delta: (payload, state, onChunk) =>
    handleBlockDelta(payload, state, onChunk),
  content_block_stop: (payload, state, onChunk) =>
    handleBlockStop(payload, state, onChunk),
  message_delta: (payload, state, onChunk) => {
    emitUsage(state.inputTokens, payload.usage, onChunk);
    return state;
  },
  ping: (_payload, state) => state,
  message_stop: (_payload, state) => ({
    ...state,
    receivedMessageStop: true,
  }),
};

export function handleAnthropicStreamPayload(
  payload: any,
  state: AnthropicStreamState,
  onChunk: (message: SSEMessage) => void,
): AnthropicStreamState {
  const handler = PAYLOAD_HANDLERS[payload?.type];
  return handler ? handler(payload, state, onChunk) : state;
}

export function assertAnthropicStreamCompleted(
  state: AnthropicStreamState,
): void {
  if (state.receivedMessageStop) return;
  throw new IncompleteProviderStreamError(
    "Anthropic stream ended before message_stop.",
  );
}
