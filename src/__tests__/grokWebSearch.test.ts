import { describe, expect, it, vi } from "vitest";
import {
  parseGrokSearchResponse,
  runGrokWebSearch,
} from "../lib/search/grokWebSearch";

describe("Grok web search response", () => {
  it("parses root citations and removes duplicate URLs", () => {
    const result = parseGrokSearchResponse({
      output_text: "A current research brief.",
      citations: [
        "https://example.com/a",
        { url: "https://example.com/b" },
        "https://example.com/a",
      ],
    });

    expect(result.summary).toBe("A current research brief.");
    expect(result.sources).toEqual([
      expect.objectContaining({
        title: "example.com",
        url: "https://example.com/a",
      }),
      expect.objectContaining({
        title: "example.com",
        url: "https://example.com/b",
      }),
    ]);
    expect(result.images).toEqual([]);
  });

  it("parses response annotations", () => {
    const result = parseGrokSearchResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "Annotated research.",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://news.example.org/report",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.summary).toBe("Annotated research.");
    expect(result.sources[0]?.url).toBe("https://news.example.org/report");
  });

  it("parses single and double bracket inline citations", () => {
    const result = parseGrokSearchResponse({
      output_text:
        "First [1](https://one.example/a), second [[2]](https://two.example/b).",
    });

    expect(result.sources.map((source) => source.url)).toEqual([
      "https://one.example/a",
      "https://two.example/b",
    ]);
  });

  it("rejects responses without a research summary", () => {
    expect(() =>
      parseGrokSearchResponse({ citations: ["https://example.com"] }),
    ).toThrow("Grok search returned no research summary");
  });

  it("rejects responses without web citations", () => {
    expect(() =>
      parseGrokSearchResponse({ output_text: "Uncited response" }),
    ).toThrow("Grok search returned no web citations");
  });

  it("sends a Responses API web_search request", async () => {
    const request = vi.fn(async () => ({
      output_text: "Live result [1](https://example.com/live).",
    }));

    await runGrokWebSearch({
      query: " latest release ",
      model: "grok-4",
      request,
    });

    expect(request).toHaveBeenCalledWith({
      model: "grok-4",
      input: [
        expect.objectContaining({
          role: "user",
          content: expect.stringContaining("latest release"),
        }),
      ],
      tools: [{ type: "web_search" }],
    });
  });
});
