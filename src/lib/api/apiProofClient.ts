import { isApiProofProtectedRoute } from "../security/apiRoutePolicy";
import { getResponseErrorMessage, readJsonResponseOrThrow } from "./response";

const API_PROOF_SESSION_PATH = "/api/request-proof/session";
const API_PROOF_REFRESH_SKEW_MS = 60_000;
const API_PROOF_NONCE_BYTES = 16;
const API_PROOF_HEADERS = {
  timestamp: "x-neo-api-proof-timestamp",
  nonce: "x-neo-api-proof-nonce",
  signature: "x-neo-api-proof-signature",
} as const;

interface RequestProofSessionResponse {
  enabled: boolean;
  clientKey?: string;
  expiresAt?: number;
  serverTime?: number;
}

interface CachedRequestProofSession {
  enabled: boolean;
  clientKey?: string;
  expiresAt?: number;
  serverTimeOffsetMs: number;
}

let apiProofSession: CachedRequestProofSession | null = null;
let apiProofSessionPromise: Promise<CachedRequestProofSession> | null = null;
let apiProofCryptoKey: {
  clientKey: string;
  promise: Promise<CryptoKey>;
} | null = null;
const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded.padEnd(
    padded.length + ((4 - (padded.length % 4)) % 4),
    "=",
  );
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function resolveFetchUrl(input: RequestInfo | URL): URL | null {
  const raw = input instanceof Request ? input.url : String(input);
  try {
    if (typeof window !== "undefined") {
      const url = new URL(raw, window.location.href);
      return url.origin === window.location.origin ? url : null;
    }
    return raw.startsWith("/") ? new URL(raw, "https://neo.local") : null;
  } catch {
    return null;
  }
}

function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (
    init?.method ||
    (input instanceof Request ? input.method : undefined) ||
    "GET"
  ).toUpperCase();
}

function getMergedHeaders(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : {});
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  return headers;
}

function isSessionUsable(
  session: CachedRequestProofSession | null,
): session is CachedRequestProofSession {
  if (!session) return false;
  if (!session.enabled) return true;
  if (!session.expiresAt) return false;
  const serverNow = Date.now() + session.serverTimeOffsetMs;
  return session.expiresAt - serverNow > API_PROOF_REFRESH_SKEW_MS;
}

function parseSession(
  data: RequestProofSessionResponse,
): CachedRequestProofSession {
  const serverTime = typeof data.serverTime === "number" ? data.serverTime : 0;
  const serverTimeOffsetMs = serverTime ? serverTime - Date.now() : 0;
  if (!data.enabled) return { enabled: false, serverTimeOffsetMs };
  if (!data.clientKey || typeof data.expiresAt !== "number") {
    throw new Error("Invalid API request proof session");
  }
  return {
    enabled: true,
    clientKey: data.clientKey,
    expiresAt: data.expiresAt,
    serverTimeOffsetMs,
  };
}

async function loadApiProofSession(): Promise<CachedRequestProofSession> {
  const response = await fetch(API_PROOF_SESSION_PATH, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(
        response,
        "API request proof is not available",
      ),
    );
  }
  return parseSession(
    await readJsonResponseOrThrow<RequestProofSessionResponse>(
      response,
      "API request proof is not available",
    ),
  );
}

async function getApiProofSession(): Promise<CachedRequestProofSession> {
  if (isSessionUsable(apiProofSession)) return apiProofSession;
  if (!apiProofSessionPromise) {
    apiProofSessionPromise = loadApiProofSession()
      .then((session) => {
        apiProofSession = session;
        return session;
      })
      .finally(() => {
        apiProofSessionPromise = null;
      });
  }
  return apiProofSessionPromise;
}

async function importApiProofKey(clientKey: string): Promise<CryptoKey> {
  if (apiProofCryptoKey?.clientKey !== clientKey) {
    apiProofCryptoKey = {
      clientKey,
      promise: crypto.subtle.importKey(
        "raw",
        toArrayBuffer(base64UrlToBytes(clientKey)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    };
  }
  return apiProofCryptoKey.promise;
}

function createNonce(): string {
  const bytes = new Uint8Array(API_PROOF_NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function signingInput(options: {
  method: string;
  target: string;
  timestamp: string;
  nonce: string;
}): string {
  return `${options.method.toUpperCase()}\n${options.target}\n${options.timestamp}\n${options.nonce}`;
}

async function createProofHeaders(options: {
  clientKey: string;
  method: string;
  target: string;
  timestamp: string;
  nonce: string;
}) {
  const key = await importApiProofKey(options.clientKey);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput(options)),
  );
  return {
    [API_PROOF_HEADERS.timestamp]: options.timestamp,
    [API_PROOF_HEADERS.nonce]: options.nonce,
    [API_PROOF_HEADERS.signature]: bytesToBase64Url(new Uint8Array(signature)),
  };
}

export function clearApiProofSessionCache(): void {
  apiProofSession = null;
  apiProofSessionPromise = null;
  apiProofCryptoKey = null;
}

export async function signedApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = resolveFetchUrl(input);
  const method = getFetchMethod(input, init);
  if (!url || !isApiProofProtectedRoute(url.pathname, method)) {
    return fetch(input, init);
  }
  const session = await getApiProofSession();
  if (!session.enabled || !session.clientKey) return fetch(input, init);

  const target = `${url.pathname}${url.search}`;
  const timestamp = String(Math.trunc(Date.now() + session.serverTimeOffsetMs));
  const nonce = createNonce();
  const headers = getMergedHeaders(input, init);
  const proofHeaders = await createProofHeaders({
    clientKey: session.clientKey,
    method,
    target,
    timestamp,
    nonce,
  });
  for (const [key, value] of Object.entries(proofHeaders)) {
    headers.set(key, value);
  }
  return fetch(input, { ...init, headers });
}
