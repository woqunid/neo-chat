import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_ERROR_CODES,
  ACCESS_LOCKOUT_MS,
  ACCESS_MAX_ATTEMPTS,
  ACCESS_SESSION_COOKIE,
  createAccessAttemptCookieValue,
  createAccessSessionCookieValue,
} from "../lib/security/accessControl";
import {
  applyRequestGuards,
  clearRequestRateLimitBuckets,
  getRateLimitClientIp,
  REQUEST_GUARD_ERROR_CODES,
} from "../lib/security/requestGuards";
import { config as proxyConfig, middleware as proxy } from "../middleware";

const ACCESS_VERIFY_RATE_LIMIT = 300;
const PLUGIN_LIST_RATE_LIMIT = 15;

describe("access proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearRequestRateLimitBuckets();
  });

  it("matches API routes and allows public bootstrap routes", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    expect(proxyConfig.matcher).toBe("/api/:path*");
    await expect(
      proxy(new NextRequest("https://neo.test/api/config")),
    ).resolves.toMatchObject({ status: 200 });

    vi.stubEnv("ACCESS_PASSWORD", "secret");
    await expect(
      proxy(new NextRequest("https://neo.test/api/access/verify")),
    ).resolves.toMatchObject({ status: 200 });
  });

  it("rejects cross-origin browser mutations", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    const crossOrigin = await proxy(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers: { origin: "https://evil.test" },
      }),
    );
    const sameSite = await proxy(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers: { "sec-fetch-site": "same-site" },
      }),
    );

    expect(crossOrigin.status).toBe(403);
    expect((await crossOrigin.json()).code).toBe(
      REQUEST_GUARD_ERROR_CODES.csrf,
    );
    expect(sameSite.status).toBe(403);
  });

  it("allows controlled server-side mutations without browser metadata", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    const response = await proxy(
      new NextRequest("https://neo.test/api/access/verify", { method: "POST" }),
    );
    expect(response.status).toBe(200);
  });

  it("rate limits access verification by trusted client IP", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const request = () =>
      proxy(
        new NextRequest("https://neo.test/api/access/verify", {
          method: "POST",
          headers: {
            origin: "https://neo.test",
            "x-forwarded-for": "203.0.113.10",
          },
        }),
      );

    for (let index = 0; index < ACCESS_VERIFY_RATE_LIMIT; index += 1) {
      await expect(request()).resolves.toMatchObject({ status: 200 });
    }
    const response = await request();
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe(
      REQUEST_GUARD_ERROR_CODES.rateLimited,
    );
  });

  it("only trusts forwarded IP headers when configured", () => {
    const request = new NextRequest("https://neo.test/api/chat", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.88, 198.51.100.2" },
    });
    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    expect(getRateLimitClientIp(request)).toBe("unknown");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    expect(getRateLimitClientIp(request)).toBe("203.0.113.88");
  });

  it("rate limits high-cost GET routes for trusted clients", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const request = () =>
      applyRequestGuards(
        new NextRequest("https://neo.test/api/plugins/list", {
          headers: { "x-forwarded-for": "203.0.113.55" },
        }),
      );
    for (let index = 0; index < PLUGIN_LIST_RATE_LIMIT; index += 1) {
      await expect(request()).resolves.toBeNull();
    }
    await expect(request()).resolves.toMatchObject({ status: 429 });
  });

  it("enforces access and lock sessions", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const denied = await proxy(new NextRequest("https://neo.test/api/config"));
    expect(denied.status).toBe(401);
    expect((await denied.json()).code).toBe(ACCESS_ERROR_CODES.required);

    const sessionValue = await createAccessSessionCookieValue();
    const allowed = await proxy(
      new NextRequest("https://neo.test/api/config", {
        headers: { cookie: `${ACCESS_SESSION_COOKIE}=${sessionValue}` },
      }),
    );
    expect(allowed.status).toBe(200);

    const attemptsValue = await createAccessAttemptCookieValue({
      attempts: ACCESS_MAX_ATTEMPTS,
      lockedUntil: Date.now() + ACCESS_LOCKOUT_MS,
    });
    const locked = await proxy(
      new NextRequest("https://neo.test/api/config", {
        headers: { cookie: `${ACCESS_ATTEMPTS_COOKIE}=${attemptsValue}` },
      }),
    );
    expect(locked.status).toBe(423);
  });
});
