import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateRAGQueries: vi.fn(),
  generateRelatedQuestions: vi.fn(),
  generateTitle: vi.fn(),
  handleChatStream: vi.fn(),
  resolveProviderRuntimeConfig: vi.fn(async (provider) => provider),
}));

vi.mock("@/lib/api/chat-handler", () => ({
  handleChatStream: mocks.handleChatStream,
}));
vi.mock("@/lib/api/auxiliary-handler", () => ({
  generateRAGQueries: mocks.generateRAGQueries,
  generateRelatedQuestions: mocks.generateRelatedQuestions,
  generateTitle: mocks.generateTitle,
}));
vi.mock("@/lib/api/middleware", () => ({
  validateRequestBody: vi.fn(),
  withApiHandler: (handler: unknown) => handler,
  withStreamApiHandler: (handler: unknown) => handler,
}));
vi.mock("@/lib/api/schemas", async () => {
  const { z } = await import("zod");
  return {
    MessageSchema: z.any(),
    ModelNameSchema: z.string(),
    ProviderRuntimeConfigSchema: z.any(),
    SimpleGenerateRequestSchema: { parse: (body: unknown) => body },
  };
});
vi.mock("@/lib/byok/server", () => ({
  resolveProviderRuntimeConfig: mocks.resolveProviderRuntimeConfig,
}));
vi.mock("@/config/limits", () => ({
  API_INPUT_LIMITS: { maxAuxiliaryTextChars: 100_000 },
}));

const body = {
  provider: { type: "OpenAI", source: "server-default" },
  modelName: "gpt-test",
  history: [],
  prompt: "Hello",
  userMessage: "Hello",
};

describe("auxiliary route cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handleChatStream.mockResolvedValue(new Response());
    mocks.generateTitle.mockResolvedValue("Title");
    mocks.generateRelatedQuestions.mockResolvedValue([]);
    mocks.generateRAGQueries.mockResolvedValue([]);
  });

  it.each([
    ["../app/api/chat/generate/route", mocks.handleChatStream],
    ["../app/api/chat/generate-title/route", mocks.generateTitle],
    ["../app/api/chat/related-questions/route", mocks.generateRelatedQuestions],
    ["../app/api/chat/rag-queries/route", mocks.generateRAGQueries],
  ])("passes request.signal through %s", async (path, handler) => {
    const request = new Request(`https://neo.local/${path}`, {
      method: "POST",
    });
    const { POST } = await import(path);

    await (POST as unknown as (request: Request, body: unknown) => Response)(
      request,
      body,
    );

    const lastArgument = handler.mock.calls[0]?.at(-1);
    expect(lastArgument).toEqual(
      expect.objectContaining({ signal: request.signal }),
    );
  });
});
