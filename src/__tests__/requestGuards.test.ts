import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
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
