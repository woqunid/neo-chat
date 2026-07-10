import { describe, expect, it, vi } from "vitest";
import {
  executeGrokSearchTool,
  GROK_WEB_SEARCH_TOOL,
  parseGrokSearchToolQuery,
} from "../lib/search/grokTool";

const SEARCH_RESULT = {
  summary: "Current facts.",
  sources: [
    {
      title: "Example",
      url: "https://example.com/current",
      content: "Current evidence",
    },
  ],
  images: [],
};

describe("Grok web search tool", () => {
  it("exposes a focused read-only search definition", () => {
    expect(GROK_WEB_SEARCH_TOOL.function.name).toBe("grok_web_search");
    expect(GROK_WEB_SEARCH_TOOL.function.parameters.required).toEqual([
      "query",
    ]);
    expect(GROK_WEB_SEARCH_TOOL.function.parameters.additionalProperties).toBe(
      false,
    );
  });

  it("validates and normalizes the model-provided query", () => {
    expect(parseGrokSearchToolQuery({ query: "  current release  " })).toBe(
      "current release",
    );
    expect(() => parseGrokSearchToolQuery({ query: " " })).toThrow(
      "requires a non-empty query",
    );
  });

  it("returns structured results and emits execution status", async () => {
    const search = vi.fn(async () => SEARCH_RESULT);
    const events: unknown[] = [];

    const result = await executeGrokSearchTool({
      args: { query: "latest release" },
      search,
      onStatus: (event) => events.push(event),
    });

    expect(search).toHaveBeenCalledWith("latest release", undefined);
    expect(result).toEqual({ query: "latest release", ...SEARCH_RESULT });
    expect(events).toEqual([
      { type: "started" },
      { type: "completed", result },
    ]);
  });

  it("surfaces provider failures through the status channel", async () => {
    const search = vi.fn(async () => {
      throw new Error("Grok unavailable");
    });
    const events: unknown[] = [];

    await expect(
      executeGrokSearchTool({
        args: { query: "latest release" },
        search,
        onStatus: (event) => events.push(event),
      }),
    ).rejects.toThrow("Grok unavailable");
    expect(events).toEqual([
      { type: "started" },
      { type: "failed", error: "Grok unavailable" },
    ]);
  });
});
