import { assertResolvedOutboundUrlAllowed } from "./safeFetchDns";
import type { SafeFetchOptions } from "./safeFetchTypes";
import { DEFAULT_MAX_REDIRECTS } from "./safeFetchTypes";
import { getSafeUrlPolicy, validateOutboundUrl } from "./urlPolicy";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-goog-api-key",
];

function stripRedirectHeaders(
  init: RequestInit,
  fromUrl: URL,
  toUrl: URL,
): RequestInit {
  if (fromUrl.origin === toUrl.origin) return init;
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

interface FollowRedirectOptions {
  response: Response;
  currentUrl: URL;
  init: RequestInit;
  options: SafeFetchOptions;
  signal: AbortSignal;
}

async function followRedirect(
  redirectOptions: FollowRedirectOptions,
): Promise<{ url: URL; init: RequestInit } | null> {
  const { response, currentUrl, init, options, signal } = redirectOptions;
  if (!REDIRECT_STATUSES.has(response.status)) return null;
  const location = response.headers.get("location");
  if (!location) return null;
  await response.body?.cancel();
  const policy = options.policy || getSafeUrlPolicy("plugin");
  const { url } = validateOutboundUrl(new URL(location, currentUrl), policy);
  await assertResolvedOutboundUrlAllowed(url, policy, signal);
  return {
    url,
    init: normalizeRedirectMethod(
      stripRedirectHeaders(init, currentUrl, url),
      response.status,
    ),
  };
}

export interface SafeFetchResponseOptions {
  input: string | URL;
  init: RequestInit;
  options: SafeFetchOptions;
  signal: AbortSignal;
}

export async function safeFetchResponse(
  requestOptions: SafeFetchResponseOptions,
): Promise<Response> {
  const { input, init, options, signal } = requestOptions;
  const policy = options.policy || getSafeUrlPolicy("plugin");
  const validated = validateOutboundUrl(input, policy);
  const maxRedirects = policy.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  let url = validated.url;
  let requestInit: RequestInit = { ...init, signal: undefined };
  await assertResolvedOutboundUrlAllowed(url, policy, signal);
  for (let count = 0; count <= maxRedirects; count += 1) {
    await assertResolvedOutboundUrlAllowed(url, policy, signal);
    const response = await fetch(url, {
      ...requestInit,
      redirect: "manual",
      signal,
    });
    const redirect = await followRedirect({
      response,
      currentUrl: url,
      init: requestInit,
      options,
      signal,
    });
    if (!redirect) return response;
    if (count === maxRedirects) {
      throw new Error(`Too many redirects after ${maxRedirects} hops`);
    }
    url = redirect.url;
    requestInit = redirect.init;
  }
  throw new Error(`Too many redirects after ${maxRedirects} hops`);
}
