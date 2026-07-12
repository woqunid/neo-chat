import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import { streamAnthropicMessages } from "../lib/streaming/anthropic";
import { streamOpenAIResponse } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";
import {
  asyncChunks,
  contentMessages,
  createSseResponse,
  restoreStreamingMocks,
  toolCallMessages,
} from "./streamingToolCalls.helpers";

function createInvalidArgumentClient(oversizedArgs: string) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_big",
                        function: {
                          name: "lookup",
                          arguments: oversizedArgs,
                        },
                      },
                      {
                        index: 1,
                        id: "call_bad_json",
                        function: {
                          name: "lookup",
                          arguments: '{"q":',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    },
  };
}

afterEach(restoreStreamingMocks);

describe("streamed tool-call normalization", () => {
  it("maps OpenAI provider indexes to a dense bounded tool-call list", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async (request: any) => {
            void request;
            return asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 1_000_000,
                          id: "call_large_index",
                          function: {
                            name: "lookup",
                            arguments: '{"q":"neo"}',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ]);
          }),
        },
      },
    };

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolCall).toMatchObject({
      id: "call_large_index",
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
  });
});

describe("streamed tool-call normalization", () => {
  it("streams Anthropic text and tool calls", async () => {
    const messages: SSEMessage[] = [];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createSseResponse([
        {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "hello" },
        },
        {
          type: "content_block_start",
          index: 1,
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "lookup",
          },
        },
        {
          type: "content_block_delta",
          index: 1,
          delta: { type: "input_json_delta", partial_json: '{"q":"neo"}' },
        },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", usage: { output_tokens: 3 } },
        { type: "message_stop" },
      ]),
    );

    await streamAnthropicMessages({
      provider: { type: "Anthropic", apiKey: "secret" },
      model: "claude-test",
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      onChunk: (message) => messages.push(message),
    });

    expect(contentMessages(messages)[0]?.content).toBe("hello");
    expect(toolCallMessages(messages)[0]?.toolCall).toMatchObject({
      id: "toolu_1",
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
    expect(messages.some((message) => message.type === "usage")).toBe(true);
  });
});

describe("streamed tool-call normalization", () => {
  it("keeps the streamed tool-call ceiling high but bounded", async () => {
    expect(PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls).toBe(100);
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: Array.from(
                        {
                          length:
                            PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls + 2,
                        },
                        (_, index) => ({
                          index,
                          id: `call_${index}`,
                          function: {
                            name: "lookup",
                            arguments: `{"q":"${index}"}`,
                          },
                        }),
                      ),
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(toolCallMessages(messages)).toHaveLength(
      PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls,
    );
  });
});

describe("streamed tool-call normalization", () => {
  it("emits oversized or invalid OpenAI tool arguments as completed errors", async () => {
    const messages: SSEMessage[] = [];
    const oversizedArgs = `{"q":"${"x".repeat(
      PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars,
    )}"}`;
    const client = createInvalidArgumentClient(oversizedArgs);

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(2);
    expect(calls[0].toolCall).toMatchObject({
      id: "call_big",
      status: "error",
      isError: true,
    });
    expect(String(calls[0].toolCall.result)).toMatch(/too large/i);
    expect(calls[1].toolCall).toMatchObject({
      id: "call_bad_json",
      status: "error",
      isError: true,
    });
    expect(String(calls[1].toolCall.result)).toMatch(/valid JSON/i);
  });
});
