import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { API_INPUT_LIMITS } from "../config/limits";
import {
  ACCESS_ATTEMPTS_COOKIE,
  ACCESS_ERROR_CODES,
  ACCESS_LOCKOUT_MS,
  ACCESS_MAX_ATTEMPTS,
  ACCESS_SESSION_COOKIE,
  createAccessSessionCookieValue,
  getAccessAttemptState,
  isAccessLocked,
  isAccessPasswordEnabled,
  isValidAccessPassword,
  isValidAccessSessionCookie,
  recordAccessPasswordFailure,
} from "../lib/security/accessControl";
import { clearRequestRateLimitBuckets } from "../lib/security/requestGuards";

vi.mock("@/lib/security/accessControl", async () =>
  vi.importActual("../lib/security/accessControl"),
);

function extractCookieValue(setCookie: string, name: string): string {
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] || "";
}

function makeVerifyRequest(
  password: string,
  cookieHeader?: string,
): NextRequest {
  return new NextRequest("https://neo.test/api/access/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ password }),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  clearRequestRateLimitBuckets();
});

describe("access control helpers", () => {
  it("is disabled when ACCESS_PASSWORD is empty", () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    expect(isAccessPasswordEnabled()).toBe(false);
  });

  it("validates signed session cookies and rejects tampering or env changes", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");

    const cookieValue = await createAccessSessionCookieValue();
    expect(await isValidAccessSessionCookie(cookieValue)).toBe(true);
    expect(await isValidAccessSessionCookie(`${cookieValue}x`)).toBe(false);

    vi.stubEnv("ACCESS_PASSWORD", "changed");
    expect(await isValidAccessSessionCookie(cookieValue)).toBe(false);
  });
});

describe("access control helpers", () => {
  it("tracks failures and locks after the configured attempt limit", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const now = 1_700_000_000_000;

    const first = await recordAccessPasswordFailure(undefined, now);
    expect(first.attempts).toBe(1);
    expect(first.remainingAttempts).toBe(ACCESS_MAX_ATTEMPTS - 1);
    expect(first.lockedUntil).toBeUndefined();

    const second = await recordAccessPasswordFailure(
      first.cookieValue,
      now + 1,
    );
    expect(second.attempts).toBe(2);
    expect(second.remainingAttempts).toBe(ACCESS_MAX_ATTEMPTS - 2);
    expect(second.lockedUntil).toBeUndefined();

    const third = await recordAccessPasswordFailure(
      second.cookieValue,
      now + 2,
    );
    expect(third.attempts).toBe(ACCESS_MAX_ATTEMPTS);
    expect(third.remainingAttempts).toBe(0);
    expect(third.lockedUntil).toBe(now + 2 + ACCESS_LOCKOUT_MS);

    const locked = await getAccessAttemptState(third.cookieValue, now + 3);
    expect(isAccessLocked(locked, now + 3)).toBe(true);

    const expired = await getAccessAttemptState(
      third.cookieValue,
      third.lockedUntil! + 1,
    );
    expect(expired).toEqual({ attempts: 0 });
  });

  it("validates access passwords with a timing-safe helper", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");

    await expect(isValidAccessPassword("secret")).resolves.toBe(true);
    await expect(isValidAccessPassword("wrong")).resolves.toBe(false);
    await expect(isValidAccessPassword("")).resolves.toBe(false);
  });
});

describe("access password verification route", () => {
  it("sets a valid session cookie for the correct password", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const { POST } = await import("../app/api/access/verify/route");

    const response = await POST(makeVerifyRequest("secret"));
    const setCookie = response.headers.get("set-cookie") || "";
    const sessionValue = extractCookieValue(setCookie, ACCESS_SESSION_COOKIE);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(sessionValue).toBeTruthy();
    expect(await isValidAccessSessionCookie(sessionValue)).toBe(true);
    expect(setCookie).toContain(`${ACCESS_ATTEMPTS_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("returns 401 for invalid passwords before the lock threshold", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const { POST } = await import("../app/api/access/verify/route");

    const response = await POST(makeVerifyRequest("wrong"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      code: ACCESS_ERROR_CODES.invalid,
      remainingAttempts: ACCESS_MAX_ATTEMPTS - 1,
    });
  });
});

describe("access password verification route", () => {
  it("rejects oversized verification bodies before parsing unauthenticated JSON", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const { POST } = await import("../app/api/access/verify/route");

    const response = await POST(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(API_INPUT_LIMITS.maxJsonBodyBytes + 1),
        },
        body: JSON.stringify({ password: "secret" }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});

describe("access password verification route", () => {
  it("locks on the third invalid password and keeps rejecting while locked", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    const { POST } = await import("../app/api/access/verify/route");

    const first = await POST(makeVerifyRequest("wrong"));
    const firstAttempts = extractCookieValue(
      first.headers.get("set-cookie") || "",
      ACCESS_ATTEMPTS_COOKIE,
    );
    const second = await POST(
      makeVerifyRequest("wrong", `${ACCESS_ATTEMPTS_COOKIE}=${firstAttempts}`),
    );
    const secondAttempts = extractCookieValue(
      second.headers.get("set-cookie") || "",
      ACCESS_ATTEMPTS_COOKIE,
    );
    const third = await POST(
      makeVerifyRequest("wrong", `${ACCESS_ATTEMPTS_COOKIE}=${secondAttempts}`),
    );
    const thirdData = await third.json();

    expect(third.status).toBe(423);
    expect(thirdData.code).toBe(ACCESS_ERROR_CODES.locked);
    expect(thirdData.lockedUntil).toEqual(expect.any(Number));

    const thirdAttempts = extractCookieValue(
      third.headers.get("set-cookie") || "",
      ACCESS_ATTEMPTS_COOKIE,
    );
    const locked = await POST(
      makeVerifyRequest("secret", `${ACCESS_ATTEMPTS_COOKIE}=${thirdAttempts}`),
    );
    const lockedData = await locked.json();

    expect(locked.status).toBe(423);
    expect(lockedData.code).toBe(ACCESS_ERROR_CODES.locked);
  });
});

describe("access password verification route", () => {
  it("keeps access failures server-side when the attempt cookie is cleared", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const { POST } = await import("../app/api/access/verify/route");

    const headers = { "x-forwarded-for": "203.0.113.44" };
    await POST(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "wrong" }),
      }),
    );
    await POST(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "wrong" }),
      }),
    );
    const third = await POST(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "wrong" }),
      }),
    );
    expect(third.status).toBe(423);

    const locked = await POST(
      new NextRequest("https://neo.test/api/access/verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ password: "secret" }),
      }),
    );
    const data = await locked.json();

    expect(locked.status).toBe(423);
    expect(data.code).toBe(ACCESS_ERROR_CODES.locked);
  });
});

describe("access password verification route", () => {
  it("does not share an unknown-IP lockout across signed attempt cookies", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "secret");
    vi.stubEnv("TRUST_PROXY_HEADERS", "");
    const { POST } = await import("../app/api/access/verify/route");

    const clientA = await POST(makeVerifyRequest("wrong"));
    const clientACookie = extractCookieValue(
      clientA.headers.get("set-cookie") || "",
      ACCESS_ATTEMPTS_COOKIE,
    );
    const clientASecond = await POST(
      makeVerifyRequest("wrong", `${ACCESS_ATTEMPTS_COOKIE}=${clientACookie}`),
    );
    expect(clientASecond.status).toBe(401);

    const clientB = await POST(makeVerifyRequest("wrong"));
    expect(clientB.status).toBe(401);
    expect(await clientB.json()).toMatchObject({
      remainingAttempts: ACCESS_MAX_ATTEMPTS - 1,
    });
  });
});
