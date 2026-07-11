import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_PROVIDER_ID_PREFIX } from "../lib/defaultConfig/shared";
import {
  clearServerModelProvidersForTesting,
  listServerModelProviders,
  saveServerModelProviders,
} from "../lib/providers/serverRegistry";

vi.mock("server-only", () => ({}));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/providers/serverRegistry", async () =>
  vi.importActual("../lib/providers/serverRegistry"),
);

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest("https://neo.test/api/superadmin/providers", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("superadmin provider route", () => {
  beforeEach(() => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("MODEL_PROVIDER_STORE", "memory");
    clearServerModelProvidersForTesting();
  });

  afterEach(() => {
    clearServerModelProvidersForTesting();
    vi.unstubAllEnvs();
  });

  it("persists an empty provider list when the last provider is deleted", async () => {
    await saveServerModelProviders([
      {
        id: `${SERVER_PROVIDER_ID_PREFIX}existing`,
        name: "Existing",
        type: "OpenAI",
        baseUrl: "https://api.openai.com",
        apiKey: "secret",
        enabled: true,
        models: ["gpt-5"],
        updatedAt: new Date().toISOString(),
      },
    ]);

    const { PUT } = await import("../app/api/superadmin/providers/route");
    const response = await PUT(makePutRequest({ providers: [] }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.providers).toEqual([]);
    expect(await listServerModelProviders()).toEqual([]);
  });

  it("writes hosted provider config with the Upstash command protocol", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("MODEL_PROVIDER_STORE", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-token");
    clearServerModelProvidersForTesting();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: null }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: "OK" }), { status: 200 }),
      );

    const { PUT } = await import("../app/api/superadmin/providers/route");
    const response = await PUT(
      makePutRequest({
        providers: [
          {
            name: "Hosted",
            type: "OpenAI",
            apiKey: "secret",
            models: ["gpt-5"],
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://redis.example/",
      expect.objectContaining({
        method: "POST",
        body: expect.stringMatching(/^\["SET","neo:server-model-providers",/),
      }),
    );
  });
});
