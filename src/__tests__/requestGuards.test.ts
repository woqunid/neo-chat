import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  applyRequestGuards,
  clearRequestRateLimitBuckets,
  enforceRateLimit,
} from "../lib/security/requestGuards";
import {
  API_PROOF_SESSION_COOKIE,
  clearRequestProofSigningKeyForTesting,
  createRequestProofSession,
} from "../lib/security/requestProof";
import {
  MemoryRateLimitStore,
  setRateLimitStoreForTesting,
} from "../lib/security/rateLimitStore";

const AGENT_RATE_LIMIT = 30;

afterEach(() => {
  vi.unstubAllEnvs();
  clearRequestRateLimitBuckets();
  clearRequestProofSigningKeyForTesting();
  setRateLimitStoreForTesting(null);
});

describe("request guard rate limiting", () => {
  it("shares quotas across dynamic paths in one route family", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    for (let index = 0; index < AGENT_RATE_LIMIT; index += 1) {
      await expect(
        enforceRateLimit(
          new NextRequest("https://neo.test/api/agents/a", {
            headers: { "x-forwarded-for": "203.0.113.10" },
          }),
        ),
      ).resolves.toBeNull();
    }
    const response = await enforceRateLimit(
      new NextRequest("https://neo.test/api/agents/b", {
        headers: { "x-forwarded-for": "203.0.113.10" },
      }),
    );
    expect(response?.status).toBe(429);
  });

  it("does not create a shared bucket for an unknown client", async () => {
    for (let index = 0; index <= AGENT_RATE_LIMIT; index += 1) {
      await expect(
        enforceRateLimit(new NextRequest("https://neo.test/api/agents/a")),
      ).resolves.toBeNull();
    }
  });

  it("bounds proof-session creation without a client identity", async () => {
    for (let index = 0; index < AGENT_RATE_LIMIT; index += 1) {
      await expect(
        enforceRateLimit(
          new NextRequest("https://neo.test/api/request-proof/session"),
        ),
      ).resolves.toBeNull();
    }
    const response = await enforceRateLimit(
      new NextRequest("https://neo.test/api/request-proof/session"),
    );
    expect(response?.status).toBe(429);
  });

  it("uses a signed proof session when trusted IP headers are unavailable", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "stable-test-key");
    setRateLimitStoreForTesting(new MemoryRateLimitStore());
    const session = await createRequestProofSession();
    const headers = {
      cookie: `${API_PROOF_SESSION_COOKIE}=${session.cookieValue}`,
    };

    for (let index = 0; index < AGENT_RATE_LIMIT; index += 1) {
      await expect(
        enforceRateLimit(
          new NextRequest("https://neo.test/api/agents/a", { headers }),
        ),
      ).resolves.toBeNull();
    }
    const response = await enforceRateLimit(
      new NextRequest("https://neo.test/api/agents/b", { headers }),
    );
    expect(response?.status).toBe(429);
  });
});

describe("production local API fail-closed", () => {
  it("returns 503 when production local mode has no access boundary", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("ACCESS_PASSWORD", "   ");
    vi.stubEnv("ALLOW_INSECURE_LOCAL_PRODUCTION", "false");

    const response = await applyRequestGuards(
      new NextRequest("https://neo.test/api/agents"),
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(await response?.json()).toMatchObject({
      code: "PRODUCTION_LOCAL_OPEN_API_BLOCKED",
      statusCode: 503,
    });
  });

  it.each(["true", "1", "yes", "on", " TRUE "])(
    "accepts the explicit override value %s",
    async (override) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("DEPLOYMENT_MODE", "local");
      vi.stubEnv("ACCESS_PASSWORD", "");
      vi.stubEnv("ALLOW_INSECURE_LOCAL_PRODUCTION", override);

      await expect(
        applyRequestGuards(new NextRequest("https://neo.test/api/unknown")),
      ).resolves.toBeNull();
    },
  );

  it("keeps local development without a password available", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("ACCESS_PASSWORD", "");

    await expect(
      applyRequestGuards(new NextRequest("https://neo.test/api/unknown")),
    ).resolves.toBeNull();
  });
});
