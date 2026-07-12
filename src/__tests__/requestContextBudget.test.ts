import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  boundHistoryForRequest,
  ContextBudgetExceededError,
} from "../lib/chat/requestContextBudget";
import type { Message } from "../types";

function message(id: string, role: Message["role"], content: string): Message {
  return { id, role, content, timestamp: 1 };
}

describe("complete request context budget", () => {
  it("keeps the latest complete turn and trims oldest history first", () => {
    const history = [
      message("old-user", "user", "o".repeat(3_000)),
      message("old-model", "model", "o".repeat(3_000)),
      message("new-user", "user", "latest question"),
      message("new-model", "model", "latest answer"),
    ];

    const bounded = boundHistoryForRequest(history, {
      newMessage: "current input",
      attachments: [],
      modelInputTokenLimit: 1_200,
      reservedOutputTokens: 200,
    });

    expect(bounded.map((item) => item.id)).toEqual(["new-user", "new-model"]);
  });

  it("budgets historical attachments with an explicit omission marker", () => {
    const bounded = boundHistoryForRequest(
      [
        {
          ...message("user", "user", "See old file"),
          attachments: [
            {
              id: "large",
              fileName: "large.txt",
              mimeType: "text/plain",
              data: "x".repeat(5_000),
            },
          ],
        },
        message("model", "model", "Old answer"),
      ],
      {
        newMessage: "current input",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    expect(bounded[0].attachments).toBeUndefined();
    expect(bounded[0].content).toContain("Historical attachment omitted");
  });

  it("retains recent attachment references within their budget", () => {
    const reference = {
      id: "reference",
      fileName: "reference.pdf",
      mimeType: "application/pdf",
      url: "https://files.example.com/reference.pdf",
    };
    const bounded = boundHistoryForRequest(
      [
        { ...message("user", "user", "Read this"), attachments: [reference] },
        message("model", "model", "Read"),
      ],
      {
        newMessage: "current",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    expect(bounded[0].attachments).toEqual([reference]);
  });

  it("truncates tool results while retaining name and arguments", () => {
    const bounded = boundHistoryForRequest(
      [
        message("user", "user", "Run lookup"),
        {
          ...message("model", "model", "Lookup complete"),
          toolCalls: [
            {
              id: "tool-1",
              name: "lookup_records",
              args: { query: "important" },
              status: "success",
              result: "r".repeat(5_000),
            },
          ],
        },
      ],
      {
        newMessage: "current input",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    const result = String(bounded[1].toolCalls?.[0]?.result);
    expect(result).toContain("Tool result truncated");
    expect(result).toContain("lookup_records");
    expect(result).toContain("important");
    expect(result.length).toBeLessThan(5_000);
  });

  it("rejects fixed request inputs beyond the model context", () => {
    expect(() =>
      boundHistoryForRequest([], {
        newMessage: "x".repeat(4_001),
        attachments: [],
        systemInstruction: "system",
        tools: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      }),
    ).toThrow(ContextBudgetExceededError);
  });

  it("omits older tool calls beyond a zero remaining tool budget", () => {
    const bounded = boundHistoryForRequest(
      [
        message("user", "user", "Run tools"),
        {
          ...message("model", "model", "Done"),
          toolCalls: Array.from({ length: 20 }, (_, index) => ({
            id: `tool-${index}`,
            name: `tool_${index}`,
            args: { query: "q".repeat(1_000) },
            status: "success" as const,
            result: "r".repeat(1_000),
          })),
        },
      ],
      {
        newMessage: "current",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    expect(JSON.stringify(bounded).length).toBeLessThan(4_000);
    expect(bounded.at(-1)?.content).toContain("tool calls omitted");
  });

  it("surfaces unserializable tool definitions", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() =>
      boundHistoryForRequest([], {
        newMessage: "current",
        attachments: [],
        tools: [circular],
      }),
    ).toThrow(/circular/i);
  });

  it("applies the budget before every chat request round", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/services/api/chat/streamRound.ts"),
      "utf8",
    );

    expect(source).toContain("boundHistoryForRequest(runtime.requestHistory");
    expect(source).toContain("history: boundedRequestHistory");
    expect(source).toContain("selectedModelMetadata?.limit?.context");
  });
});
