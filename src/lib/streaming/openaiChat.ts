import { IncompleteProviderStreamError } from "../errors";
import type { OpenAIStreamOptions } from "./openai";
import { createThinkTagStreamParser } from "./openaiThinkParser";
import {
  createOpenAIStreamRequest,
  emitStreamTiming,
  extractOpenAIText,
} from "./openaiShared";
import type { SSEMessage } from "./sse";
import {
  appendOpenAIToolCallDelta,
  createOpenAIToolCallAccumulator,
  finalizeOpenAIToolCalls,
} from "./toolCalls";

function normalizeMessages(messages: any[]): any[] {
  return messages.map((message) => {
    const content = message?.content;
    if (!Array.isArray(content) || content.length !== 1) return message;
    const [part] = content;
    if (
      part?.type !== "text" ||
      typeof part.text !== "string" ||
      Object.keys(part).some((key) => key !== "type" && key !== "text")
    ) {
      return message;
    }
    return { ...message, content: part.text };
  });
}

function createRequestParams(options: OpenAIStreamOptions): any {
  const params: any = {
    model: options.model,
    messages: normalizeMessages(options.messages),
    stream: true,
  };
  if (!options.model.startsWith("o1-")) {
    params.temperature = options.temperature ?? 1;
    if (options.tools?.length) params.tools = options.tools;
  }
  return params;
}

function emitParsedText(
  delta: any,
  parser: ReturnType<typeof createThinkTagStreamParser>,
  onChunk: (message: SSEMessage) => void,
): void {
  if (delta?.content) {
    for (const event of parser.consume(delta.content)) {
      onChunk({ type: event.type, content: event.content });
    }
  }
  const reasoning =
    extractOpenAIText(delta?.reasoning_content) ||
    extractOpenAIText(delta?.reasoning);
  if (reasoning) onChunk({ type: "reasoning", content: reasoning });
}

function emitChatChunk(
  chunk: any,
  toolCalls: ReturnType<typeof createOpenAIToolCallAccumulator>,
  parser: ReturnType<typeof createThinkTagStreamParser>,
  onChunk: (message: SSEMessage) => void,
): void {
  const delta = chunk.choices?.[0]?.delta;
  emitParsedText(delta, parser, onChunk);
  for (const toolCall of delta?.tool_calls || []) {
    appendOpenAIToolCallDelta(toolCalls, toolCall);
  }
  if (chunk.usage) {
    onChunk({
      type: "usage",
      usage: {
        prompt_tokens: chunk.usage.prompt_tokens,
        completion_tokens: chunk.usage.completion_tokens,
        total_tokens: chunk.usage.total_tokens,
      },
    });
  }
}

async function consumeChatStream(
  chunks: AsyncIterable<any>,
  onChunk: (message: SSEMessage) => void,
): Promise<void> {
  const toolCalls = createOpenAIToolCallAccumulator();
  const parser = createThinkTagStreamParser();
  let receivedFinishReason = false;
  for await (const chunk of chunks) {
    if (
      chunk.choices?.some(
        (choice: any) =>
          typeof choice?.finish_reason === "string" &&
          choice.finish_reason.length > 0,
      )
    ) {
      receivedFinishReason = true;
    }
    emitChatChunk(chunk, toolCalls, parser, onChunk);
  }
  for (const event of parser.flush()) {
    onChunk({ type: event.type, content: event.content });
  }
  if (!receivedFinishReason) {
    throw new IncompleteProviderStreamError(
      "OpenAI Chat Completions stream ended before a terminal finish_reason.",
    );
  }
  for (const toolCall of finalizeOpenAIToolCalls(toolCalls)) {
    onChunk({ type: "tool_call", toolCall });
  }
}

export async function streamOpenAIChat(
  options: OpenAIStreamOptions,
): Promise<void> {
  const startTime = Date.now();
  const stream = (await createOpenAIStreamRequest(
    options.client.chat.completions.create.bind(
      options.client.chat.completions,
    ),
    createRequestParams(options),
    options.signal,
  )) as AsyncIterable<any>;
  await consumeChatStream(stream, options.onChunk);
  emitStreamTiming(startTime, options.onChunk);
}
