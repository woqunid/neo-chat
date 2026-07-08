import { describe, expect, it } from "vitest";
import {
  createTranscriptChatMessages,
  requiresTranscriptHistory,
} from "../lib/api/openaiCompatibleHistory";
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

describe("OpenAI Compatible history helpers", () => {
  it("uses transcript history for known incompatible hosts", () => {
    expect(requiresTranscriptHistory("hyueapi.com")).toBe(true);
    expect(requiresTranscriptHistory("new.hyueapi.com")).toBe(true);
    expect(requiresTranscriptHistory("api.openai.com")).toBe(false);
  });

  it("flattens prior turns into the current user message", () => {
    const messages = createTranscriptChatMessages({
      history: [
        createMessage({ role: "user", content: "hello" }),
        createMessage({ role: "model", content: "hi" }),
      ],
      newMessage: "next",
      systemInstruction: "Be concise.",
    });

    expect(messages).toEqual([
      { role: "system", content: "Be concise." },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Previous conversation:",
              "User: hello",
              "",
              "Assistant: hi",
              "",
              "Current user message:",
              "next",
            ].join("\n"),
          },
        ],
      },
    ]);
  });
});
