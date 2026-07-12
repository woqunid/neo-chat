import { vi } from "vitest";
import type { SSEMessage } from "../lib/streaming/sse";

const RESPONSE_TERMINAL_EVENTS = [
  "response.completed",
  "response.failed",
  "response.error",
  "response.incomplete",
  "error",
];

export async function* asyncChunks(chunks: unknown[]) {
  const records = chunks as Array<Record<string, any>>;
  const completed = [...records];
  if (
    records.some((chunk) => Array.isArray(chunk.choices)) &&
    !records.some((chunk) =>
      chunk.choices?.some((choice: any) => choice?.finish_reason),
    )
  ) {
    completed.push({ choices: [{ delta: {}, finish_reason: "stop" }] });
  }
  if (
    records.some((chunk) => typeof chunk.type === "string") &&
    !records.some((chunk) => RESPONSE_TERMINAL_EVENTS.includes(chunk.type))
  ) {
    completed.push({ type: "response.completed", response: {} });
  }
  if (
    records.some((chunk) => Array.isArray(chunk.candidates)) &&
    !records.some((chunk) =>
      chunk.candidates?.some((candidate: any) => candidate?.finishReason),
    )
  ) {
    completed.push({ candidates: [{ finishReason: "STOP" }] });
  }
  for (const chunk of completed) yield chunk;
}

export function toolCallMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "tool_call" }> =>
      message.type === "tool_call",
  );
}

export function reasoningMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "reasoning" }> =>
      message.type === "reasoning",
  );
}

export function contentMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "content" }> =>
      message.type === "content",
  );
}

export function createSseResponse(events: unknown[]) {
  const encoder = new TextEncoder();
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
  );
}

export function restoreStreamingMocks(): void {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
}
