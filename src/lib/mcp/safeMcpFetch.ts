import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { assertOutboundUrlAllowed } from "../security/safeFetch";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";
import type { CreateSafeMcpFetchOptions } from "./types";

const MCP_REQUEST_TIMEOUT_MS = 30_000;
const MCP_MAX_RESPONSE_BYTES = PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars;
const MCP_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-goog-api-key",
];

interface FetchState {
  readonly input: RequestInfo | URL;
  readonly init: RequestInit;
  readonly url: URL;
}

interface FetchContext {
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

async function assertMcpOutboundUrlAllowed(
  url: URL,
  context: FetchContext,
): Promise<void> {
  const preflight = assertOutboundUrlAllowed(url, {
    policy: getSafeUrlPolicy("mcp"),
    timeoutMs: context.timeoutMs,
  });
  if (!context.signal) return preflight;
  if (context.signal.aborted) throw context.signal.reason;

  await new Promise<void>((resolve, reject) => {
    const abort = () => reject(context.signal?.reason);
    context.signal?.addEventListener("abort", abort, { once: true });
    preflight.then(resolve, reject).finally(() => {
      context.signal?.removeEventListener("abort", abort);
    });
  });
}

function getChunkBytes(chunk: unknown): number {
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  if (typeof chunk === "string") return new TextEncoder().encode(chunk).length;
  if (chunk instanceof ArrayBuffer) return chunk.byteLength;
  return ArrayBuffer.isView(chunk) ? chunk.byteLength : 0;
}

function limitMcpResponseBody(response: Response, maxBytes: number): Response {
  const rawLength = response.headers.get("content-length");
  const contentLength = rawLength ? Number(rawLength) : null;
  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > maxBytes
  ) {
    throw new Error(`MCP response is too large (${contentLength} bytes)`);
  }
  if (!response.body) return response;

  let totalBytes = 0;
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        totalBytes += getChunkBytes(chunk);
        if (totalBytes > maxBytes) {
          throw new Error(`MCP response is too large (${totalBytes} bytes)`);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function stripRedirectHeaders(
  init: RequestInit,
  from: URL,
  to: URL,
): RequestInit {
  if (from.origin === to.origin) return init;
  const headers = new Headers(init.headers);
  SENSITIVE_HEADERS.forEach((header) => headers.delete(header));
  return { ...init, headers };
}

function normalizeRedirectMethod(
  init: RequestInit,
  status: number,
): RequestInit {
  const method = String(init.method || "GET").toUpperCase();
  if (status !== 303 && !([301, 302].includes(status) && method === "POST")) {
    return init;
  }
  const headers = new Headers(init.headers);
  headers.delete("content-length");
  return { ...init, method: "GET", body: undefined, headers };
}

async function nextRedirectState(
  state: FetchState,
  response: Response,
  context: FetchContext,
): Promise<FetchState | null> {
  if (!REDIRECT_STATUSES.has(response.status)) return null;
  const location = response.headers.get("location");
  if (!location) return null;
  await response.body?.cancel().catch(() => undefined);

  const policy = getSafeUrlPolicy("mcp");
  const { url } = validateOutboundUrl(new URL(location, state.url), policy);
  await assertMcpOutboundUrlAllowed(url, context);
  const init = normalizeRedirectMethod(
    stripRedirectHeaders(state.init, state.url, url),
    response.status,
  );
  return { input: url, init, url };
}

async function fetchWithValidatedRedirects(
  initialState: FetchState,
  context: FetchContext,
): Promise<Response> {
  let state = initialState;
  for (let count = 0; count <= MCP_MAX_REDIRECTS; count += 1) {
    await assertMcpOutboundUrlAllowed(state.url, context);
    const response = await fetch(state.input, {
      ...state.init,
      redirect: "manual",
    });
    const nextState = await nextRedirectState(state, response, context);
    if (!nextState)
      return limitMcpResponseBody(response, context.maxResponseBytes);
    if (count === MCP_MAX_REDIRECTS) {
      throw new Error(`Too many MCP redirects after ${MCP_MAX_REDIRECTS} hops`);
    }
    state = nextState;
  }
  throw new Error(`Too many MCP redirects after ${MCP_MAX_REDIRECTS} hops`);
}

export function createSafeMcpFetch(
  options: CreateSafeMcpFetchOptions = {},
): typeof fetch {
  const contextDefaults = {
    maxResponseBytes: Math.max(
      1,
      options.maxResponseBytes || MCP_MAX_RESPONSE_BYTES,
    ),
    timeoutMs: options.timeoutMs || MCP_REQUEST_TIMEOUT_MS,
  };
  return async (input, init) => {
    const target =
      typeof input === "string" || input instanceof URL ? input : input.url;
    const { url } = validateOutboundUrl(target, getSafeUrlPolicy("mcp"));
    const signal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetchWithValidatedRedirects(
      { input, init: { ...init }, url },
      { ...contextDefaults, signal: signal || undefined },
    );
  };
}
