import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { streamOpenAIChatCompletions } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";
import {
  asyncChunks,
  reasoningMessages,
  restoreStreamingMocks,
} from "./streamingToolCalls.helpers";

describe("OpenAI Compatible streaming", () => {
  afterEach(restoreStreamingMocks);

  it("keeps chat completions available", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([{ choices: [{ delta: { content: "Compat" } }] }]),
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
    expect(requestOptions).toMatchObject({ maxRetries: 0, timeout: 120_000 });
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses a conservative chat request shape", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([{ choices: [{ delta: { content: "Compat" } }] }]),
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
        { role: "assistant", content: "Hi" },
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
    expect(request.messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(request.messages[1]).toEqual({ role: "assistant", content: "Hi" });
    expect(request.messages[2].content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "Describe this" },
        expect.objectContaining({ type: "image_url" }),
      ]),
    );
  });

  it("streams reasoning deltas without user control", async () => {
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
                choices: [{ delta: { reasoning: "More hidden reasoning." } }],
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

  it("does not send reasoning effort controls", async () => {
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
              { choices: [{ delta: { reasoning: "Check sources." } }] },
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
});
