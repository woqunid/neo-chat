import { describe, expect, it } from "vitest";
import { GROK_SEARCH_LIMITS } from "../config/limits";
import { GROK_WEB_SEARCH_TOOL_NAME } from "../lib/search/grokTool";
import { createSearchResearchPolicy } from "../services/api/chat/searchResearchPolicy";
import type { Source, ToolCall } from "../types";

const SEARCH_TOOL = {
  type: "function" as const,
  function: { name: GROK_WEB_SEARCH_TOOL_NAME },
};

function searchCall(id: string, query: string): ToolCall {
  return {
    id,
    name: GROK_WEB_SEARCH_TOOL_NAME,
    args: { query },
    status: "pending",
  };
}

function completedSearch(call: ToolCall, sources: Source[]): ToolCall {
  return {
    ...call,
    status: "success",
    result: {
      query: call.args.query,
      summary: "Research summary",
      sources,
      images: [],
    },
  };
}

function source(url: string): Source {
  return { title: "Source", content: "Evidence", url };
}

describe("search research policy", () => {
  it("stops equivalent queries and removes the search tool", () => {
    const policy = createSearchResearchPolicy();
    expect(
      policy.reviewToolCall(searchCall("one", "Current Release")),
    ).toMatchObject({
      status: "pending",
    });

    const repeated = policy.reviewToolCall(
      searchCall("two", "  current   release "),
    );

    expect(repeated).toMatchObject({ status: "skipped", isError: true });
    expect(policy.availableTools([SEARCH_TOOL])).toEqual([]);
    expect(policy.continuationInstruction()).toContain("equivalent query");
  });

  it("uses an explicit search-only per-generation budget", () => {
    const policy = createSearchResearchPolicy();
    const reviewed = Array.from(
      { length: GROK_SEARCH_LIMITS.maxToolCallsPerGeneration },
      (_, index) =>
        policy.reviewToolCall(searchCall(`${index}`, `query ${index}`)),
    );

    expect(reviewed.every((call) => call.status === "pending")).toBe(true);
    expect(policy.availableTools([SEARCH_TOOL])).toEqual([]);
    expect(policy.continuationInstruction()).toContain("explicit limit");
  });

  it("stops after consecutive rounds add no canonical source URLs", () => {
    const policy = createSearchResearchPolicy();
    const urls = [
      "https://example.com/report?utm_source=one",
      "https://example.com/report?utm_source=two",
      "https://example.com/report#details",
    ];

    urls.forEach((url, index) => {
      const call = policy.reviewToolCall(
        searchCall(`${index}`, `query ${index}`),
      );
      policy.recordRound([completedSearch(call, [source(url)])]);
    });

    expect(policy.availableTools([SEARCH_TOOL])).toEqual([]);
    expect(policy.continuationInstruction()).toContain("no new sources");
  });
});
