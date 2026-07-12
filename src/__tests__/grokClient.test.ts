import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProviderOutboundAllowed: vi.fn(),
  createOpenAIClient: vi.fn(),
  createResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../lib/providers/base", () => ({
  ProviderFactory: {
    assertProviderOutboundAllowed: mocks.assertProviderOutboundAllowed,
    createOpenAIClient: mocks.createOpenAIClient,
  },
}));

beforeEach(() => {
  vi.stubEnv("GROK_SEARCH_TIMEOUT_MS", "");
  mocks.assertProviderOutboundAllowed.mockResolvedValue(undefined);
  mocks.createResponse.mockResolvedValue({
    output_text: "Current result [1](https://example.com/current).",
  });
  mocks.createOpenAIClient.mockReturnValue({
    responses: { create: mocks.createResponse },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Grok search client", () => {
  it("uses the independent Grok search timeout", async () => {
    const { runGrokSearchWithConfig } =
      await import("../lib/search/grokClient");

    await runGrokSearchWithConfig("latest release", {
      baseUrl: "https://proxy.example.com/v1",
      apiKey: "test-key",
      model: "grok-4",
      enabled: true,
      updatedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(mocks.createResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "grok-4",
        tools: [{ type: "web_search" }],
      }),
      { maxRetries: 0, timeout: 60_000 },
    );
  });

  it("passes caller cancellation to the Grok provider request", async () => {
    const controller = new AbortController();
    const { runGrokSearchWithConfig } =
      await import("../lib/search/grokClient");

    await runGrokSearchWithConfig(
      "latest release",
      {
        baseUrl: "https://proxy.example.com/v1",
        apiKey: "test-key",
        model: "grok-4",
        enabled: true,
        updatedAt: "2026-07-10T00:00:00.000Z",
      },
      controller.signal,
    );

    expect(mocks.createResponse.mock.calls[0]?.[1]).toMatchObject({
      signal: controller.signal,
      timeout: 60_000,
    });
  });
});

describe("Grok search client", () => {
  it("rejects a pre-aborted Grok request before provider work", async () => {
    const controller = new AbortController();
    controller.abort();
    const { runGrokSearchWithConfig } =
      await import("../lib/search/grokClient");

    await expect(
      runGrokSearchWithConfig(
        "latest release",
        {
          baseUrl: "https://proxy.example.com/v1",
          apiKey: "test-key",
          model: "grok-4",
          enabled: true,
          updatedAt: "2026-07-10T00:00:00.000Z",
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.assertProviderOutboundAllowed).not.toHaveBeenCalled();
    expect(mocks.createResponse).not.toHaveBeenCalled();
  });
});
