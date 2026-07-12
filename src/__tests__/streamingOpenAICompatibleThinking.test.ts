import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { streamOpenAIChatCompletions } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";
import {
  asyncChunks,
  contentMessages,
  reasoningMessages,
  restoreStreamingMocks,
} from "./streamingToolCalls.helpers";

describe("OpenAI Compatible thinking normalization", () => {
  afterEach(restoreStreamingMocks);

  it("ignores reasoning modes when building requests", async () => {
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

  it("separates DeepSeek think tags from visible content", async () => {
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
        .map(({ content }) => content)
        .join(""),
    ).toBe("Intro  Final answer.");
  });

  it("handles think tags split across chunks", async () => {
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
        .map(({ content }) => content)
        .join(""),
    ).toBe("Step one. Step two.");
    expect(
      contentMessages(messages)
        .map(({ content }) => content)
        .join(""),
    ).toBe("Start  Done.");
  });

  it("separates think tags when legacy reasoning is disabled", async () => {
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
        .map(({ content }) => content)
        .join(""),
    ).toBe("Answer");
  });
});
