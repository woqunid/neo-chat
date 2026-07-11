import { describe, expect, it } from "vitest";
import { createMessageExportSnapshot } from "../lib/chat/messageExport";
import type { Message } from "../types";

const message: Message = {
  id: "message-1",
  role: "model",
  content: "Final answer",
  reasoning: "Private reasoning",
  timestamp: 1,
  searchSources: [
    { title: "Source", url: "https://example.com", content: "Private source" },
  ],
  toolCalls: [
    {
      id: "tool-1",
      name: "search",
      args: {},
      status: "success",
      result: "Private tool result",
    },
  ],
  outputBlocks: [
    { id: "reasoning", type: "reasoning", content: "Private reasoning" },
    {
      id: "tool",
      type: "tool_group",
      toolCalls: [
        {
          id: "tool-1",
          name: "search",
          args: {},
          status: "success",
        },
      ],
    },
    {
      id: "search",
      type: "search",
      sources: [
        {
          title: "Source",
          url: "https://example.com",
          content: "Private source",
        },
      ],
      images: [],
    },
    { id: "text", type: "text", content: "Final answer" },
    {
      id: "image",
      type: "image",
      image: { id: "image-1", mimeType: "image/png", fileName: "result.png" },
    },
  ],
};

describe("message export snapshot", () => {
  it("keeps only public answer text and generated images", () => {
    const snapshot = createMessageExportSnapshot(message);

    expect(snapshot.outputBlocks?.map((block) => block.type)).toEqual([
      "text",
      "image",
    ]);
    expect(snapshot).not.toHaveProperty("reasoning");
    expect(snapshot).not.toHaveProperty("toolCalls");
    expect(snapshot).not.toHaveProperty("searchSources");
  });

  it("removes legacy reasoning, tools, and sources", () => {
    const snapshot = createMessageExportSnapshot({
      ...message,
      outputBlocks: undefined,
    });

    expect(snapshot.outputBlocks).toEqual([
      {
        id: "message-1-legacy-text",
        type: "text",
        content: "Final answer",
      },
    ]);
  });
});
