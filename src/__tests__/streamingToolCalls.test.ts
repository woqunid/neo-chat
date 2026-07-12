import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import { streamAnthropicMessages } from "../lib/streaming/anthropic";
import { streamGeminiResponse } from "../lib/streaming/gemini";
import {
  streamOpenAIChatCompletions,
  streamOpenAIResponse,
  streamOpenAIResponses,
} from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";

async function* asyncChunks(chunks: unknown[]) {
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
    !records.some((chunk) =>
      [
        "response.completed",
        "response.failed",
        "response.error",
        "response.incomplete",
        "error",
      ].includes(chunk.type),
    )
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
  for (const chunk of completed) {
    yield chunk;
  }
}

function toolCallMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "tool_call" }> =>
      message.type === "tool_call",
  );
}

function reasoningMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "reasoning" }> =>
      message.type === "reasoning",
  );
}

function contentMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "content" }> =>
      message.type === "content",
  );
}

function createSseResponse(events: unknown[]) {
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

describe("streamed tool-call normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

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

  it("emits oversized or invalid OpenAI tool arguments as completed errors", async () => {
    const messages: SSEMessage[] = [];
    const oversizedArgs = `{"q":"${"x".repeat(
      PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars,
    )}"}`;
    const client = {
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

  it("streams OpenAI Responses API text, usage, and function calls", async () => {
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
      expect.objectContaining({
        model: "gpt-test",
        stream: true,
      }),
      expect.objectContaining({ maxRetries: 0, timeout: 120_000 }),
    );
    const responsesRequestOptions = (client.responses.create as any).mock
      .calls[0][1];
    expect(responsesRequestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("emits final Responses API text when no text delta was streamed", async () => {
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

  it("rejects Chat Completions data returned from a Responses endpoint", async () => {
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

  it("rejects a Responses stream that completes without output", async () => {
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

  it("allows disabling OpenAI stream request timeout", async () => {
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

  it("keeps chat completions available for OpenAI Compatible providers", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: { content: "Compat" },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      tools: [],
      onChunk: (message) => messages.push(message),
    });

    expect(messages).toContainEqual({ type: "content", content: "Compat" });
    const request = (client.chat.completions.create as any).mock.calls[0][0];
    const requestOptions = (client.chat.completions.create as any).mock
      .calls[0][1];
    expect(request).not.toHaveProperty("tools");
    expect(requestOptions).toMatchObject({
      maxRetries: 0,
      timeout: 120_000,
    });
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a conservative OpenAI Compatible chat request shape", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: { content: "Compat" },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "mimo-v2.5-free",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: "Hi",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/image.png" },
            },
          ],
        },
      ],
      onChunk: (message) => messages.push(message),
    });

    const request = (client.chat.completions.create as any).mock.calls[0][0];
    expect(request).not.toHaveProperty("stream_options");
    expect(request.messages[0]).toEqual({
      role: "user",
      content: "Hello",
    });
    expect(request.messages[1]).toEqual({
      role: "assistant",
      content: "Hi",
    });
    expect(request.messages[2].content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "Describe this" },
        expect.objectContaining({ type: "image_url" }),
      ]),
    );
  });

  it("streams OpenAI Compatible reasoning deltas without user control", async () => {
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
                      reasoning_content: "Hidden chain. ",
                      content: "Answer",
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      reasoning: "More hidden reasoning.",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Hidden chain. ", "More hidden reasoning."]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("does not send OpenAI Compatible reasoning effort controls", async () => {
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
                      reasoning_content: "Consider freshness. ",
                      content: "Answer",
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      reasoning: "Check sources.",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    const request = (client.chat.completions.create as any).mock.calls[0][0];
    expect(request).not.toHaveProperty("reasoning_effort");
    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Consider freshness. ", "Check sources."]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("ignores OpenAI Compatible reasoning modes when building requests", async () => {
    const makeClient = () => ({
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([{ choices: [{ delta: {}, finish_reason: "stop" }] }]),
          ),
        },
      },
    });
    const lowClient = makeClient();
    const autoClient = makeClient();
    const offClient = makeClient();

    await streamOpenAIChatCompletions({
      client: lowClient as any,
      model: "compat-model",
      messages: [],
      onChunk: () => undefined,
    });
    await streamOpenAIChatCompletions({
      client: autoClient as any,
      model: "compat-model",
      messages: [],
      onChunk: () => undefined,
    });
    await streamOpenAIChatCompletions({
      client: offClient as any,
      model: "compat-model",
      messages: [],
      onChunk: () => undefined,
    });

    expect(
      (lowClient.chat.completions.create as any).mock.calls[0][0]
        .reasoning_effort,
    ).toBeUndefined();
    expect(
      (autoClient.chat.completions.create as any).mock.calls[0][0],
    ).not.toHaveProperty("reasoning_effort");
    expect(
      (offClient.chat.completions.create as any).mock.calls[0][0],
    ).not.toHaveProperty("reasoning_effort");
  });

  it("separates DeepSeek think tags from visible OpenAI Compatible content", async () => {
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
                      content:
                        "Intro <think>Check contrast.</think> Final answer.",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "deepseek-reasoner",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Check contrast."]);
    expect(
      contentMessages(messages)
        .map((message) => message.content)
        .join(""),
    ).toBe("Intro  Final answer.");
  });

  it("handles DeepSeek think tags split across OpenAI Compatible chunks", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              { choices: [{ delta: { content: "Start <thi" } }] },
              { choices: [{ delta: { content: "nk>Step one. " } }] },
              { choices: [{ delta: { content: "Step two.</th" } }] },
              { choices: [{ delta: { content: "ink> Done." } }] },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "deepseek-reasoner",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages)
        .map((message) => message.content)
        .join(""),
    ).toBe("Step one. Step two.");
    expect(
      contentMessages(messages)
        .map((message) => message.content)
        .join(""),
    ).toBe("Start  Done.");
  });

  it("separates DeepSeek think tags even when legacy reasoning is disabled", async () => {
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
                      content: "<think>Hidden chain.</think>Answer",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "deepseek-reasoner",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Hidden chain."]);
    expect(
      contentMessages(messages)
        .map((message) => message.content)
        .join(""),
    ).toBe("Answer");
  });

  it("streams OpenAI Responses reasoning events without user control", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.reasoning_summary_text.delta",
              delta: "Hidden summary.",
            },
            {
              type: "response.output_item.done",
              item: {
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Hidden item." }],
              },
            },
            {
              type: "response.output_text.delta",
              delta: "Visible answer",
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

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Hidden summary."]);
    expect(messages).toContainEqual({
      type: "content",
      content: "Visible answer",
    });
  });

  it("does not request OpenAI Responses reasoning summaries in auto mode", async () => {
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            { type: "response.output_text.delta", delta: "Visible answer" },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: () => undefined,
    });

    const request = (client.responses.create as any).mock.calls[0][0];
    expect(request).not.toHaveProperty("reasoning");
  });

  it("normalizes Gemini tool calls with unique IDs and argument errors", async () => {
    const messages: SSEMessage[] = [];
    vi.spyOn(Date, "now").mockReturnValue(123);
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: "lookup",
                          args: { q: "neo" },
                        },
                      },
                      {
                        functionCall: {
                          name: "lookup",
                          args: "not-an-object",
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
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.toolCall.id)).toEqual([
      "call_123_0",
      "call_123_1",
    ]);
    expect(calls[0].toolCall).toMatchObject({
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
    expect(calls[1].toolCall).toMatchObject({
      name: "lookup",
      status: "error",
      isError: true,
    });
    expect(String(calls[1].toolCall.result)).toMatch(/JSON object/i);
  });

  it("streams Gemini thought parts without user control", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      { thought: true, text: "Hidden thought. " },
                      { text: "Answer" },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Hidden thought. "]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("streams Gemini thought parts as reasoning", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      { thought: true, text: "I should search. " },
                      { text: "Answer" },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      onChunk: (message) => messages.push(message),
    });

    const request = (client.models.generateContentStream as any).mock
      .calls[0][0];
    expect(request.config).not.toHaveProperty("thinkingConfig");
    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["I should search. "]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("does not map Gemini 2.5 reasoning modes to thinking budgets", async () => {
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([{ candidates: [{ finishReason: "STOP" }] }]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-2.5-flash",
      contents: [],
      onChunk: () => undefined,
    });

    const request = (client.models.generateContentStream as any).mock
      .calls[0][0];
    expect(request.config).not.toHaveProperty("thinkingConfig");
  });

  it("does not map Gemini 3 reasoning modes to thinking levels", async () => {
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([{ candidates: [{ finishReason: "STOP" }] }]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-3-flash-preview",
      contents: [],
      onChunk: () => undefined,
    });

    const request = (client.models.generateContentStream as any).mock
      .calls[0][0];
    expect(request.config).not.toHaveProperty("thinkingConfig");
  });
});
