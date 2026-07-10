import { describe, expect, it } from "vitest";
import type { GrokSearchStatusEvent } from "../lib/search/grokTool";
import { createGrokSearchStatusTracker } from "../services/api/grokSearchStatus";

const COMPLETED_EVENT: GrokSearchStatusEvent = {
  type: "completed",
  result: {
    query: "current release",
    summary: "Current facts.",
    sources: [
      {
        title: "Example",
        url: "https://example.com/current",
        content: "Current evidence",
      },
    ],
    images: [],
  },
};

describe("Grok search status tracker", () => {
  it("keeps parallel searches active and preserves partial results", () => {
    const updates: unknown[] = [];
    const track = createGrokSearchStatusTracker((update) =>
      updates.push(update),
    );

    track({ type: "started" });
    track({ type: "started" });
    track(COMPLETED_EVENT);
    track({ type: "failed", error: "second search failed" });

    expect(updates.at(-1)).toEqual({
      isSearching: false,
      error: "second search failed",
      results: {
        sources: COMPLETED_EVENT.result.sources,
        images: [],
      },
    });
  });

  it("rejects an unmatched completion event", () => {
    const track = createGrokSearchStatusTracker(() => undefined);
    expect(() => track(COMPLETED_EVENT)).toThrow("without a matching start");
  });
});
