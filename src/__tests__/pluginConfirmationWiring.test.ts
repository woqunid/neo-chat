import { describe, expect, it } from "vitest";
import { readChatAppSources } from "./helpers/chatAppSources";

describe("plugin confirmation UI wiring", () => {
  it("wires runtime tool confirmation into ChatApp streaming calls", () => {
    const chatApp = readChatAppSources();

    expect(chatApp).toContain("requestToolConfirmation");
    expect(chatApp).toContain("window.confirm");
    expect(chatApp).toContain("callbacks.requestToolConfirmation");
    expect(chatApp).toContain("streamChatResponse(");
  });
});
