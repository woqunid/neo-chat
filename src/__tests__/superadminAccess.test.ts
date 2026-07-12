import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPERADMIN_SESSION_COOKIE,
  createSuperadminSession,
  isValidSuperadminSession,
} from "../lib/security/superadminAccess";
import { middleware } from "../middleware";

vi.mock("server-only", () => ({}));

describe("superadmin access control", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("signs sessions with the dedicated administrator password", async () => {
    vi.stubEnv("SUPERADMIN_PASSWORD", "admin-secret");
    const session = await createSuperadminSession();

    expect(await isValidSuperadminSession(session)).toBe(true);
    vi.stubEnv("SUPERADMIN_PASSWORD", "changed-secret");
    expect(await isValidSuperadminSession(session)).toBe(false);
  });

  it("protects superadmin APIs without protecting public APIs", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    vi.stubEnv("SUPERADMIN_PASSWORD", "admin-secret");
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    vi.stubEnv("DEPLOYMENT_MODE", "local");

    const denied = await middleware(
      new NextRequest("https://neo.test/api/superadmin/providers"),
    );
    const publicResponse = await middleware(
      new NextRequest("https://neo.test/api/config"),
    );
    const session = await createSuperadminSession();
    const allowed = await middleware(
      new NextRequest("https://neo.test/api/superadmin/providers", {
        headers: { cookie: `${SUPERADMIN_SESSION_COOKIE}=${session}` },
      }),
    );

    expect(denied.status).toBe(401);
    expect(publicResponse.status).toBe(200);
    expect(allowed.status).toBe(200);
  });

  it("runs administrator authentication after generic request guards", async () => {
    vi.stubEnv("ACCESS_PASSWORD", "");
    vi.stubEnv("SUPERADMIN_PASSWORD", "admin-secret");
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "");

    const response = await middleware(
      new NextRequest("https://neo.test/api/superadmin/providers"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Administrator password is required",
    });
  });
});
