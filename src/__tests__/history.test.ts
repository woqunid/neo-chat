import { describe, expect, it } from "vitest";
import {
  prepareOpenAIHistory,
  prepareOpenAIResponsesInput,
} from "../lib/utils/history";
import type { Message } from "../types";

function createMessage(overrides: Partial<Message>): Message {
  return {
    id: overrides.id ?? "message-id",
    role: overrides.role ?? "user",
    content: overrides.content ?? "",
    timestamp: overrides.timestamp ?? 1,
    ...overrides,
  };
}

describe("history helpers", () => {
  it("omits reasoning-only assistant messages from OpenAI chat history", () => {
    const history = prepareOpenAIHistory([
      createMessage({ role: "user", content: "first question" }),
      createMessage({
        role: "model",
        content: "",
        reasoning: "private reasoning",
      }),
      createMessage({ role: "user", content: "second question" }),
    ]);

    expect(history).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "first question" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "second question" }],
      },
    ]);
  });

  it("keeps visible assistant content in OpenAI chat history", () => {
    const history = prepareOpenAIHistory([
      createMessage({
        role: "model",
        content: "visible answer",
        reasoning: "private reasoning",
      }),
    ]);

    expect(history).toEqual([{ role: "assistant", content: "visible answer" }]);
  });

  it("omits reasoning-only assistant messages from OpenAI responses input", () => {
    const input = prepareOpenAIResponsesInput([
      createMessage({
        role: "model",
        content: "   ",
        reasoning: "private reasoning",
      }),
    ]);

    expect(input).toEqual([]);
  });

  it("uses output text for visible assistant messages in OpenAI responses input", () => {
    const input = prepareOpenAIResponsesInput([
      createMessage({ role: "model", content: "visible answer" }),
    ]);

    expect(input).toEqual([
      {
        role: "assistant",
        content: [{ type: "output_text", text: "visible answer" }],
      },
    ]);
  });
});
