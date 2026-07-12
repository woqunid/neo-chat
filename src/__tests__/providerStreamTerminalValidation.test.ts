import { describe, expect, it, vi } from "vitest";
import { streamGeminiResponse } from "../lib/streaming/gemini";
import {
  streamOpenAIChatCompletions,
  streamOpenAIResponses,
} from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";

vi.mock("server-only", () => ({}));

const incompleteProviderStream = {
  name: "IncompleteProviderStreamError",
  code: "INCOMPLETE_PROVIDER_STREAM",
  statusCode: 502,
};

async function* asyncChunks(chunks: unknown[]) {
  for (const chunk of chunks) yield chunk;
}

function content(messages: SSEMessage[]): string {
  return messages
    .filter(
      (message): message is Extract<SSEMessage, { type: "content" }> =>
        message.type === "content",
    )
    .map((message) => message.content)
    .join("");
}

function createChatClient(chunks: unknown[]) {
  return {
    chat: {
      completions: { create: vi.fn(async () => asyncChunks(chunks)) },
    },
  };
}

function createResponsesClient(chunks: unknown[]) {
  return {
    responses: { create: vi.fn(async () => asyncChunks(chunks)) },
  };
}

function createGeminiClient(chunks: unknown[]) {
  return {
    models: { generateContentStream: vi.fn(async () => asyncChunks(chunks)) },
  };
}

describe("provider stream terminal validation", () => {
  it("accepts an OpenAI Chat Completions finish_reason", async () => {
    const client = createChatClient([
      { choices: [{ delta: { content: "hello" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);
    const messages: SSEMessage[] = [];

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });
    expect(content(messages)).toBe("hello");
  });

  it("rejects premature OpenAI Chat EOF after preserving content", async () => {
    const client = createChatClient([
      { choices: [{ delta: { content: "partial" } }] },
    ]);
    const messages: SSEMessage[] = [];

    await expect(
      streamOpenAIChatCompletions({
        client: client as any,
        model: "gpt-test",
        messages: [],
        onChunk: (message) => messages.push(message),
      }),
    ).rejects.toMatchObject(incompleteProviderStream);
    expect(content(messages)).toBe("partial");
  });

  it("passes caller cancellation to OpenAI SDK request options", async () => {
    const client = createChatClient([
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);
    const controller = new AbortController();
    controller.abort();

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "gpt-test",
      messages: [],
      signal: controller.signal,
      onChunk: vi.fn(),
    });
    const requestOptions = (client.chat.completions.create as any).mock
      .calls[0][1];
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
    expect(requestOptions.signal.aborted).toBe(true);
  });

  it("requires response.completed for OpenAI Responses", async () => {
    const messages: SSEMessage[] = [];
    const client = createResponsesClient([
      { type: "response.output_text.delta", delta: "hello" },
      { type: "response.completed", response: {} },
    ]);

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: (message) => messages.push(message),
    });
    expect(content(messages)).toBe("hello");
  });

  it("rejects premature OpenAI Responses EOF after preserving content", async () => {
    const messages: SSEMessage[] = [];
    const client = createResponsesClient([
      { type: "response.output_text.delta", delta: "partial" },
    ]);

    await expect(
      streamOpenAIResponses({
        client: client as any,
        model: "gpt-test",
        input: [],
        onChunk: (message) => messages.push(message),
      }),
    ).rejects.toMatchObject(incompleteProviderStream);
    expect(content(messages)).toBe("partial");
  });

  it.each([
    ["response.failed", { error: { message: "failed upstream" } }],
    ["response.error", { error: { message: "errored upstream" } }],
    ["error", { message: "generic upstream error" }],
    [
      "response.incomplete",
      { response: { incomplete_details: { reason: "max_output_tokens" } } },
    ],
  ])("rejects the OpenAI Responses %s terminal", async (type, details) => {
    const client = createResponsesClient([{ type, ...details }]);
    await expect(
      streamOpenAIResponses({
        client: client as any,
        model: "gpt-test",
        input: [],
        onChunk: vi.fn(),
      }),
    ).rejects.toThrow(/OpenAI Responses/i);
  });

  it.each(["STOP", "SAFETY"])(
    "accepts Gemini %s as a valid finishReason",
    async (finishReason) => {
      const client = createGeminiClient([{ candidates: [{ finishReason }] }]);
      await expect(
        streamGeminiResponse({
          client: client as any,
          model: "gemini-test",
          contents: [],
          onChunk: vi.fn(),
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("rejects premature Gemini EOF after preserving content", async () => {
    const client = createGeminiClient([
      { candidates: [{ content: { parts: [{ text: "partial" }] } }] },
    ]);
    const messages: SSEMessage[] = [];

    await expect(
      streamGeminiResponse({
        client: client as any,
        model: "gemini-test",
        contents: [],
        onChunk: (message) => messages.push(message),
      }),
    ).rejects.toMatchObject(incompleteProviderStream);
    expect(content(messages)).toBe("partial");
  });

  it("rejects an unspecified Gemini finishReason", async () => {
    const client = createGeminiClient([
      { candidates: [{ finishReason: "FINISH_REASON_UNSPECIFIED" }] },
    ]);
    await expect(
      streamGeminiResponse({
        client: client as any,
        model: "gemini-test",
        contents: [],
        onChunk: vi.fn(),
      }),
    ).rejects.toMatchObject(incompleteProviderStream);
  });

  it("passes caller cancellation to Gemini request config", async () => {
    const client = createGeminiClient([
      { candidates: [{ finishReason: "STOP" }] },
    ]);
    const controller = new AbortController();

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      signal: controller.signal,
      onChunk: vi.fn(),
    });
    const request = (client.models.generateContentStream as any).mock
      .calls[0][0];
    expect(request.config.abortSignal).toBe(controller.signal);
  });
});
