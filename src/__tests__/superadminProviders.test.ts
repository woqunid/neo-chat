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
});
