import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clearRateLimitStoreForTesting,
  incrementRateLimitBucket,
} from "./rateLimitStore";
import {
  getApiRateLimitPolicy,
  isMutatingApiRouteMethod,
  type ApiRateLimitPolicy,
} from "./apiRoutePolicy";
import {
  enforceApiRequestProof,
  getRequestProofRateLimitIdentity,
} from "./requestProof";
import type { RateLimitResult } from "./rateLimitStore";

export const REQUEST_GUARD_ERROR_CODES = {
  csrf: "CSRF_ORIGIN_BLOCKED",
  rateLimited: "RATE_LIMITED",
} as const;

const MILLISECONDS_PER_SECOND = 1_000;
const MINIMUM_RETRY_AFTER_SECONDS = 1;

function jsonError(
  status: number,
  payload: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(
    { ...payload, statusCode: status },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function envBool(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function shouldTrustProxyHeaders(): boolean {
  return envBool("TRUST_PROXY_HEADERS");
}

export function getRateLimitClientIp(request: NextRequest): string {
  if (!shouldTrustProxyHeaders()) return "unknown";

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getRequestOrigin(request: NextRequest): string {
  const protocol = request.nextUrl.protocol.replace(":", "");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (shouldTrustProxyHeaders() && forwardedHost) {
    return `${forwardedProto || protocol}://${forwardedHost}`;
  }

  const host = request.headers.get("host");
  if (host) return `${protocol}://${host}`;
  return request.nextUrl.origin;
}

export function isMutatingRequest(request: NextRequest): boolean {
  return isMutatingApiRouteMethod(request.method);
}

export function validateSameOriginRequest(
  request: NextRequest,
): NextResponse | null {
  if (!isMutatingRequest(request)) return null;

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return jsonError(403, {
      error: "Cross-site API requests are blocked",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  let parsedOrigin: URL;
  let expectedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
    expectedOrigin = new URL(getRequestOrigin(request));
  } catch {
    return jsonError(403, {
      error: "Invalid request origin",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  if (parsedOrigin.origin !== expectedOrigin.origin) {
    return jsonError(403, {
      error: "Cross-origin API requests are blocked",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  return null;
}

interface RateLimitIdentityOptions {
  request: NextRequest;
  rule: ApiRateLimitPolicy;
  now: number;
}

async function getRateLimitIdentity(
  options: RateLimitIdentityOptions,
): Promise<string | null> {
  const { request, rule, now } = options;
  const clientIp = getRateLimitClientIp(request);
  if (rule.routeFamily === "/api/access/verify") {
    return clientIp === "unknown" ? "deployment" : clientIp;
  }
  if (clientIp !== "unknown") return clientIp;
  return getRequestProofRateLimitIdentity(request, now);
}

function createRateLimitResponse(
  current: RateLimitResult,
  now: number,
): NextResponse {
  const retryAfterSeconds = Math.max(
    MINIMUM_RETRY_AFTER_SECONDS,
    Math.ceil((current.resetAt - now) / MILLISECONDS_PER_SECOND),
  );
  const response = jsonError(429, {
    error: "Too many requests. Please try again later.",
    code: REQUEST_GUARD_ERROR_CODES.rateLimited,
    retryAfter: retryAfterSeconds,
  });
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function enforceRateLimit(
  request: NextRequest,
  now = Date.now(),
): Promise<NextResponse | null> {
  const rule = getApiRateLimitPolicy(request.nextUrl.pathname, request.method);
  if (!rule) return null;

  const identity = await getRateLimitIdentity({ request, rule, now });
  if (!identity) return null;
  const key = `${identity}:${request.method}:${rule.routeFamily}`;
  const current = await incrementRateLimitBucket(key, rule.windowMs, now);
  if (current.count <= rule.maxRequests) return null;
  return createRateLimitResponse(current, now);
}

export async function applyRequestGuards(
  request: NextRequest,
): Promise<NextResponse | null> {
  const originResponse = validateSameOriginRequest(request);
  if (originResponse) return originResponse;

  const proofResponse = await enforceApiRequestProof(request);
  if (proofResponse) return proofResponse;

  return enforceRateLimit(request);
}

export function clearRequestRateLimitBuckets(): void {
  clearRateLimitStoreForTesting();
}
