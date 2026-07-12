import { describe, expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("skill invocation wiring", () => {
  it("passes skills context through every ChatApp response generation path", () => {
    const chatApp = readChatAppSources();

    const streamCallCount = countOccurrences(chatApp, "streamChatResponse(");

    expect(streamCallCount).toBeGreaterThan(0);
    expect(countOccurrences(chatApp, "resolveSkillsForMessage({")).toBe(
      streamCallCount,
    );
    expect(countOccurrences(chatApp, "request.skills.context")).toBe(
      streamCallCount,
    );
  });
});
