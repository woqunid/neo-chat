import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleChatStream: vi.fn(),
  resolveProviderRuntimeConfig: vi.fn(async (provider) => provider),
}));

vi.mock("@/lib/api/chat-handler", () => ({
  handleChatStream: mocks.handleChatStream,
}));
vi.mock("@/lib/api/middleware", () => ({
  logRequest: vi.fn(),
  withStreamApiHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/api/schemas", () => ({
  ChatRequestSchema: { parse: (body: unknown) => body },
}));
vi.mock("@/lib/byok/server", () => ({
  resolveProviderRuntimeConfig: mocks.resolveProviderRuntimeConfig,
}));

describe("chat route cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleChatStream.mockResolvedValue(new Response());
  });

  it("passes request.signal to the chat handler", async () => {
    const request = new Request("https://neo.local/api/chat", {
      method: "POST",
    });
    const body = {
      provider: { type: "Anthropic", apiKey: "test" },
      modelName: "claude-test",
      history: [],
      newMessage: "Hello",
    };
    const { POST } = await import("../app/api/chat/route");

    await (POST as unknown as (request: Request, body: unknown) => Response)(
      request,
      body,
    );

    expect(mocks.handleChatStream).toHaveBeenCalledWith(
      expect.objectContaining({ signal: request.signal }),
    );
  });
});
