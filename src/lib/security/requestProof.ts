import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isApiProofProtectedRoute } from "./apiRoutePolicy";
import { getDeploymentMode } from "./deployment";
import { incrementRateLimitBucket } from "./rateLimitStore";
import {
  clearRequestProofSigningKey,
  createRequestProofClientKey,
  hashRequestProofIdentity,
  isRequestProofConfigured,
  signRequestProofInput,
  signRequestProofSession,
  verifyRequestProofInput,
  verifyRequestProofSession,
} from "./requestProofCrypto";

export const API_PROOF_SESSION_COOKIE = "neo_api_proof_session";
export const REQUEST_PROOF_SESSION_PATH = "/api/request-proof/session";
export const API_PROOF_WINDOW_MS = 60_000;
export const API_PROOF_SESSION_TTL_MS = 10 * 60_000;

export const API_PROOF_HEADERS = {
  timestamp: "x-neo-api-proof-timestamp",
  nonce: "x-neo-api-proof-nonce",
  signature: "x-neo-api-proof-signature",
} as const;

export const API_PROOF_ERROR_CODES = {
  notConfigured: "API_PROOF_NOT_CONFIGURED",
  required: "API_PROOF_REQUIRED",
  expired: "API_PROOF_EXPIRED",
  invalid: "API_PROOF_INVALID",
} as const;

export interface RequestProofSession {
  clientKey: string;
  expiresAt: number;
  serverTime: number;
  cookieValue: string;
  windowMs: number;
  sessionTtlMs: number;
}

export interface ApiProofPublicStatus {
  required: boolean;
  enabled: boolean;
  configured: boolean;
  protectedHighCostApis: boolean;
  windowSeconds: number;
  sessionTtlSeconds: number;
}

function jsonError(status: number, payload: Record<string, unknown>) {
  const response = NextResponse.json(
    { ...payload, statusCode: status },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function isApiProofRequired(): boolean {
  return getDeploymentMode() === "hosted";
}

export function isApiProofProtectedPath(
  pathname: string,
  method = "POST",
): boolean {
  return isApiProofProtectedRoute(pathname, method);
}

export function getApiProofPublicStatus(): ApiProofPublicStatus {
  const required = isApiProofRequired();
  const configured = isRequestProofConfigured();
  return {
    required,
    enabled: required && configured,
    configured,
    protectedHighCostApis: required,
    windowSeconds: API_PROOF_WINDOW_MS / 1000,
    sessionTtlSeconds: API_PROOF_SESSION_TTL_MS / 1000,
  };
}

export async function createRequestProofSession(
  now = Date.now(),
): Promise<RequestProofSession> {
  const clientKey = createRequestProofClientKey();
  const expiresAt = now + API_PROOF_SESSION_TTL_MS;
  const cookieValue = await signRequestProofSession({
    v: 1,
    k: clientKey,
    exp: expiresAt,
  });
  return {
    clientKey,
    expiresAt,
    serverTime: now,
    cookieValue,
    windowMs: API_PROOF_WINDOW_MS,
    sessionTtlMs: API_PROOF_SESSION_TTL_MS,
  };
}

export function getRequestProofSigningInput({
  method,
  target,
  timestamp,
  nonce,
}: {
  method: string;
  target: string;
  timestamp: number | string;
  nonce: string;
}): string {
  return `${method.toUpperCase()}\n${target}\n${timestamp}\n${nonce}`;
}

export async function createRequestProofHeaders(options: {
  clientKey: string;
  method: string;
  target: string;
  timestamp: number;
  nonce: string;
}): Promise<Record<string, string>> {
  const { clientKey, timestamp, nonce } = options;
  const signature = await signRequestProofInput(
    clientKey,
    getRequestProofSigningInput(options),
  );
  return {
    [API_PROOF_HEADERS.timestamp]: String(timestamp),
    [API_PROOF_HEADERS.nonce]: nonce,
    [API_PROOF_HEADERS.signature]: signature,
  };
}

export async function getRequestProofRateLimitIdentity(
  request: NextRequest,
  now = Date.now(),
): Promise<string | null> {
  const session = await getRequestSession(request, now);
  return session ? hashRequestProofIdentity(session.k) : null;
}

async function getRequestSession(request: NextRequest, now: number) {
  return verifyRequestProofSession(
    request.cookies.get(API_PROOF_SESSION_COOKIE)?.value,
    now,
  );
}

function parseProofHeaders(request: NextRequest) {
  const timestampValue = request.headers.get(API_PROOF_HEADERS.timestamp);
  const timestamp = timestampValue ? Number(timestampValue) : Number.NaN;
  return {
    timestampValue,
    timestamp: Number.isFinite(timestamp) ? Math.trunc(timestamp) : null,
    nonce: request.headers.get(API_PROOF_HEADERS.nonce),
    signature: request.headers.get(API_PROOF_HEADERS.signature),
  };
}

function isNonceValid(value: string | null): value is string {
  return Boolean(value && /^[A-Za-z0-9_-]{8,128}$/.test(value));
}

async function isProofSignatureValid(
  request: NextRequest,
  clientKey: string,
  proof: ReturnType<typeof parseProofHeaders>,
) {
  if (!proof.timestampValue || !proof.signature || !isNonceValid(proof.nonce)) {
    return false;
  }
  const input = getRequestProofSigningInput({
    method: request.method,
    target: `${request.nextUrl.pathname}${request.nextUrl.search}`,
    timestamp: proof.timestampValue,
    nonce: proof.nonce,
  });
  return verifyRequestProofInput(clientKey, input, proof.signature);
}

async function markNonce(clientKey: string, nonce: string, now: number) {
  const key = `api-proof:${clientKey}:${nonce}`;
  const bucket = await incrementRateLimitBucket(key, API_PROOF_WINDOW_MS, now);
  return bucket.count === 1;
}

async function validateAuthenticatedProof(
  request: NextRequest,
  clientKey: string,
  now: number,
): Promise<NextResponse | null> {
  const proof = parseProofHeaders(request);
  if (
    proof.timestamp === null ||
    !isNonceValid(proof.nonce) ||
    !proof.signature
  ) {
    return jsonError(401, {
      error: "API request proof is invalid",
      code: API_PROOF_ERROR_CODES.invalid,
    });
  }
  if (Math.abs(now - proof.timestamp) > API_PROOF_WINDOW_MS) {
    return jsonError(401, {
      error: "API request proof has expired",
      code: API_PROOF_ERROR_CODES.expired,
    });
  }
  const valid = await isProofSignatureValid(request, clientKey, proof);
  const fresh = valid && (await markNonce(clientKey, proof.nonce, now));
  return fresh
    ? null
    : jsonError(401, {
        error: "API request proof is invalid",
        code: API_PROOF_ERROR_CODES.invalid,
      });
}

export async function enforceApiRequestProof(
  request: NextRequest,
  now = Date.now(),
): Promise<NextResponse | null> {
  if (
    !isApiProofRequired() ||
    !isApiProofProtectedPath(request.nextUrl.pathname, request.method)
  ) {
    return null;
  }
  if (!isRequestProofConfigured()) {
    return jsonError(503, {
      error: "API request proof is not configured",
      code: API_PROOF_ERROR_CODES.notConfigured,
    });
  }
  const session = await getRequestSession(request, now);
  if (!session) {
    return jsonError(401, {
      error: "API request proof is required",
      code: API_PROOF_ERROR_CODES.required,
    });
  }
  return validateAuthenticatedProof(request, session.k, now);
}

export function clearRequestProofSigningKeyForTesting(): void {
  clearRequestProofSigningKey();
}
