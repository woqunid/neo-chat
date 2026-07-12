import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { streamGeminiResponse } from "../lib/streaming/gemini";
import { streamOpenAIResponses } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";
import {
  asyncChunks,
  reasoningMessages,
  restoreStreamingMocks,
  toolCallMessages,
} from "./streamingToolCalls.helpers";

describe("provider reasoning streams", () => {
  afterEach(restoreStreamingMocks);

  it("streams OpenAI Responses reasoning without user control", async () => {
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

  it("does not request OpenAI Responses reasoning summaries", async () => {
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

  it("normalizes Gemini tool calls and argument errors", async () => {
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
