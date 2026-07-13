import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null as null | {
    baseUrl: string;
    apiKey: string;
    model: string;
    updatedAt: string;
  },
  runGrokSearchWithConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/errors", async () => vi.importActual("../lib/errors"));
vi.mock("@/lib/search/grokClient", () => ({
  runGrokSearchWithConfig: mocks.runGrokSearchWithConfig,
}));
vi.mock("@/lib/search/grokRegistry", () => ({
  getServerGrokSearchConfig: vi.fn(async () => mocks.config),
  isGrokSearchReady: vi.fn((config) =>
    Boolean(config?.baseUrl && config.apiKey && config.model),
  ),
}));
vi.mock("@/lib/utils/safeServerLog", () => ({ safeServerLogError: vi.fn() }));

function makeRequest(query: string): NextRequest {
  return new NextRequest("https://neo.test/api/grok-search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
}

describe("Grok search route", () => {
  beforeEach(() => {
    mocks.config = null;
    mocks.runGrokSearchWithConfig.mockReset();
  });

  it("returns 503 when Super Admin has not configured Grok search", async () => {
    const { POST } = await import("../app/api/grok-search/route");
    const response = await POST(makeRequest("latest release"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "GROK_SEARCH_UNAVAILABLE",
    });
    expect(mocks.runGrokSearchWithConfig).not.toHaveBeenCalled();
  });

  it("returns the Grok research summary and citations", async () => {
    mocks.config = {
      baseUrl: "https://proxy.example.com/v1",
      apiKey: "grok-secret",
      model: "grok-4",
      updatedAt: "2026-07-10T00:00:00.000Z",
    };
    mocks.runGrokSearchWithConfig.mockResolvedValue({
      summary: "Current result",
      sources: [
        {
          title: "Example",
          url: "https://example.com/current",
          content: "Evidence",
        },
      ],
      images: [],
    });
    const { POST } = await import("../app/api/grok-search/route");

    const response = await POST(makeRequest("  latest release  "));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.runGrokSearchWithConfig).toHaveBeenCalledWith(
      "latest release",
      mocks.config,
      expect.any(AbortSignal),
    );
    expect(body).toMatchObject({
      summary: "Current result",
      sources: [{ url: "https://example.com/current" }],
    });
  });
});
