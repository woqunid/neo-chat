import { describe, expect, it } from "vitest";
import { CONTEXT_COMPRESSION_LIMITS } from "../config/limits";
import { getSuppressedMemoryIds } from "../lib/memory/compression";
import type { Message, Session } from "../types";

function message(
  id: string,
  role: Message["role"],
  memoryIds: string[] = [],
): Message {
  return {
    id,
    role,
    content: id,
    timestamp: 1,
    ...(memoryIds.length
      ? {
          memoryContext: {
            injectedMemoryIds: memoryIds,
            promptContext: `memory for ${id}`,
          },
        }
      : {}),
  };
}

describe("memory suppression across compression", () => {
  it("uses the legacy session set before compression exists", () => {
    const session = {
      memoryContext: { injectedMemoryIds: ["legacy"] },
    } as Session;
    expect(getSuppressedMemoryIds(session, [])).toEqual(["legacy"]);
  });

  it("keeps ids represented by summary, first user, and raw tail", () => {
    const messages = [
      message("first", "user", ["first-memory"]),
      message("compressed-end", "model"),
      message("tail", "user", ["tail-memory"]),
    ];
    const session = {
      compression: {
        compressedContent: "summary",
        lastCompressedMessageId: "compressed-end",
        includedMemoryIds: ["summary-memory"],
      },
      memoryContext: { injectedMemoryIds: ["stale-memory"] },
    } as Session;
    expect(getSuppressedMemoryIds(session, messages)).toEqual([
      "summary-memory",
      "first-memory",
      "tail-memory",
    ]);
  });

  it("falls back to legacy ids when the marker is absent", () => {
    const session = {
      compression: {
        compressedContent: "summary",
        lastCompressedMessageId: "other-branch",
        includedMemoryIds: ["summary-memory"],
      },
      memoryContext: { injectedMemoryIds: ["legacy"] },
    } as Session;
    expect(getSuppressedMemoryIds(session, [message("first", "user")])).toEqual(
      ["legacy"],
    );
  });

  it("does not suppress ids removed with oversized summary content", () => {
    const session = {
      compression: {
        compressedContent: "x".repeat(
          CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars + 1,
        ),
        lastCompressedMessageId: "compressed-end",
        includedMemoryIds: ["trimmed"],
      },
    } as Session;
    const messages = [
      message("first", "user"),
      message("compressed-end", "model"),
    ];
    expect(getSuppressedMemoryIds(session, messages)).toEqual([]);
  });
});
