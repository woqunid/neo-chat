import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearServerGrokSearchConfigForTesting,
  getServerGrokSearchConfig,
  saveServerGrokSearchConfig,
} from "../lib/search/grokRegistry";

vi.mock("server-only", () => ({}));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/search/grokAdmin", async () =>
  vi.importActual("../lib/search/grokAdmin"),
);
vi.mock("@/lib/search/grokRegistry", async () =>
  vi.importActual("../lib/search/grokRegistry"),
);

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("https://neo.test/api/superadmin/grok-search", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("superadmin Grok search route", () => {
  beforeEach(() => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("MODEL_PROVIDER_STORE", "memory");
    clearServerGrokSearchConfigForTesting();
  });

  afterEach(() => {
    clearServerGrokSearchConfigForTesting();
    vi.unstubAllEnvs();
  });

  it("updates URL and model while preserving the saved API key", async () => {
    await saveServerGrokSearchConfig({
      baseUrl: "https://old.example.com/v1",
      apiKey: "stored-secret",
      model: "grok-old",
      updatedAt: "2026-07-10T00:00:00.000Z",
    });
    const { GET, PUT } =
      await import("../app/api/superadmin/grok-search/route");

    const response = await PUT(
      makePutRequest({
        baseUrl: "https://proxy.example.com/v1",
        model: "grok-4-fast",
      }),
    );
    const body = await response.json();
    const stored = await getServerGrokSearchConfig();

    expect(response.status).toBe(200);
    expect(body.config).toMatchObject({
      baseUrl: "https://proxy.example.com/v1",
      model: "grok-4-fast",
      hasApiKey: true,
    });
    expect(body.config).not.toHaveProperty("apiKey");
    expect(stored?.apiKey).toBe("stored-secret");

    const getBody = await (await GET()).json();
    expect(getBody.config).not.toHaveProperty("apiKey");
    expect(JSON.stringify(getBody)).not.toContain("stored-secret");
  });
});
