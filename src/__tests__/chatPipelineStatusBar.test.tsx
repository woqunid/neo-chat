import { describe, expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

describe("ChatPipelineStatusBar", () => {
  it("is not rendered above the message input", () => {
    const chatApp = readChatAppSources();

    expect(chatApp).not.toContain("ChatPipelineStatusBar");
    expect(chatApp).not.toContain("shouldShowPipelineStatus");
    expect(chatApp).not.toContain("pipelineStatuses");
  });
});
