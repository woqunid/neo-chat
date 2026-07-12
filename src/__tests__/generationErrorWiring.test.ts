import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

describe("generation error UI wiring", () => {
  it("renders generation errors as metadata instead of assistant text", () => {
    const chatApp = readChatAppSources();
    const messageItem = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageItem.tsx"),
      "utf8",
    );

    expect(messageItem).toContain("message.generationError");
    expect(messageItem).toContain("generationFailed");
    expect(chatApp).not.toContain("`Error: ${errorMessage}`");
  });
});
