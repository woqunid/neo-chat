import { describe, expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

describe("plugin confirmation UI wiring", () => {
  it("does not wire runtime tool confirmation into ChatApp streaming calls", () => {
    const chatApp = readChatAppSources();

    expect(chatApp).not.toContain("pendingToolConfirmation");
    expect(chatApp).not.toContain("confirmToolCall");
    expect(chatApp).not.toContain("pluginConfirmTitle");
    expect(chatApp).toContain("streamChatResponse(");
  });
});
