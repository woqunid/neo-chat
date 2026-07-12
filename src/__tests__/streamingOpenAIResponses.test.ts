import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { streamOpenAIResponses } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";
import {
  asyncChunks,
  restoreStreamingMocks,
  toolCallMessages,
} from "./streamingToolCalls.helpers";

describe("OpenAI Responses streaming", () => {
  afterEach(restoreStreamingMocks);

  it("streams text, usage, and function calls", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            { type: "response.output_text.delta", delta: "Hello" },
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                call_id: "call_lookup",
                name: "lookup",
                arguments: '{"q":"neo"}',
              },
            },
            {
              type: "response.completed",
              response: {
                usage: {
                  input_tokens: 3,
                  output_tokens: 5,
                  total_tokens: 8,
                },
              },
            },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: (message) => messages.push(message),
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        { type: "content", content: "Hello" },
        {
          type: "usage",
          usage: {
            prompt_tokens: 3,
            completion_tokens: 5,
            total_tokens: 8,
          },
        },
      ]),
    );
    expect(toolCallMessages(messages)[0].toolCall).toMatchObject({
      id: "call_lookup",
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-test", stream: true }),
      expect.objectContaining({ maxRetries: 0, timeout: 120_000 }),
    );
    const requestOptions = (client.responses.create as any).mock.calls[0][1];
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("emits final text when no text delta was streamed", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.completed",
              response: {
                output: [
                  {
                    type: "message",
                    content: [{ type: "output_text", text: "Final text" }],
                  },
                ],
              },
            },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: (message) => messages.push(message),
    });

    expect(messages).toContainEqual({ type: "content", content: "Final text" });
  });

  it("rejects Chat Completions data from a Responses endpoint", async () => {
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([{ choices: [{ delta: { content: "Wrong mode" } }] }]),
        ),
      },
    };

    await expect(
      streamOpenAIResponses({
        client: client as any,
        model: "gpt-test",
        input: [],
        onChunk: () => undefined,
      }),
    ).rejects.toThrow(/OpenAI Compatible/);
  });

  it("rejects a stream that completes without output", async () => {
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([{ type: "response.completed", response: {} }]),
        ),
      },
    };

    await expect(
      streamOpenAIResponses({
        client: client as any,
        model: "gpt-test",
        input: [],
        onChunk: () => undefined,
      }),
    ).rejects.toThrow(/completed without output/);
  });

  it("allows disabling the request timeout", async () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "0");
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([{ type: "response.output_text.delta", delta: "Hello" }]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: () => undefined,
    });

    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-test" }),
      { maxRetries: 0 },
    );
  });
});
