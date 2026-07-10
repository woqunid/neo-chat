import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  REQUEST_GUARD_ERROR_CODES,
  validateSameOriginRequest,
} from "../lib/security/requestGuards";

interface BrowserRequestOptions {
  readonly origin: string;
  readonly host: string;
  readonly forwardedHost?: string;
  readonly forwardedProto?: string;
}

function createBrowserRequest(options: BrowserRequestOptions): NextRequest {
  const headers = new Headers({
    host: options.host,
    origin: options.origin,
    "sec-fetch-site": "same-origin",
  });
  if (options.forwardedHost) {
    headers.set("x-forwarded-host", options.forwardedHost);
  }
  if (options.forwardedProto) {
    headers.set("x-forwarded-proto", options.forwardedProto);
  }
  return new NextRequest("http://localhost:3000/api/providers/models", {
    method: "POST",
    headers,
  });
}

describe("same-origin request guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the HTTP Host when Next.js canonicalizes the request URL", () => {
    const request = createBrowserRequest({
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
    });

    expect(validateSameOriginRequest(request)).toBeNull();
  });

  it("still rejects an origin that differs from the HTTP Host", async () => {
    const request = createBrowserRequest({
      origin: "https://evil.test",
      host: "127.0.0.1:3000",
    });
    const response = validateSameOriginRequest(request);

    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  });

  it("uses forwarded origin data only when proxy trust is enabled", () => {
    const request = createBrowserRequest({
      origin: "https://chat.example.com",
      host: "internal:3000",
      forwardedHost: "chat.example.com",
      forwardedProto: "https",
    });

    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    expect(validateSameOriginRequest(request)).toBeNull();
  });
});
