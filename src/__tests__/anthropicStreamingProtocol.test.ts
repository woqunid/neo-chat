import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import { streamAnthropicMessages } from "../lib/streaming/anthropic";
import type { SSEMessage } from "../lib/streaming/sse";

function createSseResponse(events: unknown[]): Response {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function streamEvents(
  events: unknown[],
  onChunk: (message: SSEMessage) => void = () => undefined,
): Promise<void> {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    createSseResponse(events),
  );
  await streamAnthropicMessages({
    provider: { type: "Anthropic", apiKey: "secret" },
    model: "claude-test",
    messages: [],
    onChunk,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Anthropic streaming protocol", () => {
  it("requires message_stop before accepting stream completion", async () => {
    const messages: SSEMessage[] = [];
    await expect(
      streamEvents(
        [
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "partial" },
          },
        ],
        (message) => messages.push(message),
      ),
    ).rejects.toMatchObject({
      name: "IncompleteProviderStreamError",
      code: "INCOMPLETE_PROVIDER_STREAM",
      statusCode: 502,
    });
    expect(messages).toContainEqual({ type: "content", content: "partial" });
    expect(messages.some((message) => message.type === "timing")).toBe(false);
  });
});

describe("Anthropic streaming protocol", () => {
  it("counts cached input tokens and ignores ping events", async () => {
    const messages: SSEMessage[] = [];
    await streamEvents(
      [
        {
          type: "message_start",
          message: {
            usage: {
              input_tokens: 7,
              cache_creation_input_tokens: 2,
              cache_read_input_tokens: 3,
            },
          },
        },
        { type: "ping" },
        { type: "message_delta", usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ],
      (message) => messages.push(message),
    );
    expect(messages).toContainEqual({
      type: "usage",
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
      },
    });
  });
});

describe("Anthropic streaming protocol", () => {
  it("surfaces Anthropic error events", async () => {
    await expect(
      streamEvents([{ type: "error", error: { message: "overloaded" } }]),
    ).rejects.toThrow("Anthropic stream failed: overloaded");
  });
});

describe("Anthropic streaming protocol", () => {
  it("preserves initial tool input when no JSON delta follows", async () => {
    const messages: SSEMessage[] = [];
    await streamEvents(
      [
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_initial",
            name: "lookup",
            input: { q: "neo" },
          },
        },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" },
      ],
      (message) => messages.push(message),
    );
    expect(messages).toContainEqual({
      type: "tool_call",
      toolCall: expect.objectContaining({
        id: "toolu_initial",
        name: "lookup",
        args: { q: "neo" },
        status: "pending",
      }),
    });
  });
});

describe("Anthropic streaming protocol", () => {
  it("fails explicitly when streamed tool input exceeds the limit", async () => {
    const oversized = "x".repeat(PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars + 1);
    await expect(
      streamEvents([
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "toolu_large",
            name: "lookup",
            input: {},
          },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: oversized },
        },
      ]),
    ).rejects.toThrow("Anthropic tool call arguments are too large");
  });
});

describe("Anthropic streaming protocol", () => {
  it("uses caller cancellation when the provider timeout is disabled", async () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "0");
    const caller = new AbortController();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createSseResponse([{ type: "message_stop" }]));

    await streamAnthropicMessages({
      provider: { type: "Anthropic", apiKey: "secret" },
      model: "claude-test",
      messages: [],
      signal: caller.signal,
      onChunk: () => undefined,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(caller.signal);
  });
});
