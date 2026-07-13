import { describe, expect, it } from "vitest";
import { collapseResearchBlocksForDisplay } from "../lib/chat/messageOutputPresentation";
import type { MessageOutputBlock } from "../types";

describe("message output presentation", () => {
  it("collapses consecutive research rounds for display", () => {
    const blocks: MessageOutputBlock[] = [
      { id: "reason-1", type: "reasoning", content: "First", durationMs: 100 },
      {
        id: "tools-1",
        type: "tool_group",
        toolCalls: [
          { id: "call-1", name: "search", args: {}, status: "success" },
        ],
      },
      {
        id: "source-1",
        type: "search",
        sources: [
          {
            title: "One",
            content: "Old",
            url: "https://example.com/a?utm_source=x",
          },
        ],
        images: [],
      },
      { id: "reason-2", type: "reasoning", content: "Second", durationMs: 200 },
      {
        id: "tools-2",
        type: "tool_group",
        toolCalls: [
          { id: "call-2", name: "search", args: {}, status: "success" },
        ],
      },
      {
        id: "source-2",
        type: "search",
        sources: [
          { title: "One", content: "New", url: "https://example.com/a#result" },
        ],
        images: [],
      },
      { id: "answer", type: "text", content: "Final answer" },
    ];

    const collapsed = collapseResearchBlocksForDisplay(blocks);

    expect(collapsed.map((block) => block.type)).toEqual([
      "reasoning",
      "tool_group",
      "search",
      "text",
    ]);
    expect(collapsed[0]).toMatchObject({
      type: "reasoning",
      content: "First\n\nSecond",
      durationMs: 300,
    });
    expect(collapsed[1]).toMatchObject({
      type: "tool_group",
      toolCalls: [{ id: "call-1" }, { id: "call-2" }],
    });
    expect(collapsed[2]).toMatchObject({
      type: "search",
      sources: [{ title: "One" }],
    });
  });

  it("does not merge research blocks across visible text", () => {
    const blocks: MessageOutputBlock[] = [
      { id: "reason-1", type: "reasoning", content: "First" },
      { id: "text", type: "text", content: "Visible" },
      { id: "reason-2", type: "reasoning", content: "Second" },
    ];

    expect(collapseResearchBlocksForDisplay(blocks)).toEqual(blocks);
  });
});
