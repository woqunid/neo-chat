import { describe, expect, it } from "vitest";
import { accumulateChatUsage } from "../lib/chat/tokenUsage";

describe("chat usage accumulation", () => {
  it("adds OpenAI usage and nested numeric details across rounds", () => {
    const first = {
      usage: {
        prompt_tokens: 10,
        completion_tokens: 2,
        total_tokens: 12,
        completion_tokens_details: { reasoning_tokens: 1 },
        first_round_only: 7,
      },
    };
    const second = {
      usage: {
        prompt_tokens: 20,
        completion_tokens: 3,
        total_tokens: 23,
        completion_tokens_details: { reasoning_tokens: 2 },
      },
    };

    expect(accumulateChatUsage(first, second)).toEqual({
      usage: {
        prompt_tokens: 30,
        completion_tokens: 5,
        total_tokens: 35,
        completion_tokens_details: { reasoning_tokens: 3 },
        first_round_only: 7,
      },
    });
  });

  it("adds Gemini usage metadata across rounds", () => {
    expect(
      accumulateChatUsage(
        {
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 2,
            totalTokenCount: 6,
          },
        },
        {
          usageMetadata: {
            promptTokenCount: 8,
            candidatesTokenCount: 3,
            totalTokenCount: 11,
          },
        },
      ),
    ).toEqual({
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 5,
        totalTokenCount: 17,
      },
    });
  });
});
