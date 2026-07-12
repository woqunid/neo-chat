import type { GoogleGenAI } from "@google/genai";
import { getSafeUrlPolicy } from "../security/urlPolicy";
import { safeFetch } from "../security/safeFetch";
import { getChatProviderTimeoutMs } from "./requestTimeout";

type ProviderFetch = typeof fetch;

interface GoogleApiClientWithFetch {
  apiClient?: {
    apiCall?: (url: string, requestInit: RequestInit) => Promise<Response>;
  };
}

const MIB_BYTES = 1024 * 1024;
export const PROVIDER_RESPONSE_LIMITS = {
  textBytes: 2 * MIB_BYTES,
  imageBytes: 36 * MIB_BYTES,
  streamBytes: 8 * MIB_BYTES,
} as const;

function getRequestBodyText(init?: RequestInit): string {
  return typeof init?.body === "string" ? init.body : "";
}

function isStreamingRequest(url: string, body: string): boolean {
  return (
    /[?&]alt=sse(?:&|$)/i.test(url) ||
    /:streamGenerateContent/i.test(url) ||
    /"stream"\s*:\s*true/i.test(body)
  );
}

function isImageRequest(url: string, body: string): boolean {
  return (
    /\/images(?:\/|$)/i.test(url) ||
    /"response_?modalities"\s*:\s*\[[^\]]*"IMAGE"/i.test(body) ||
    /"type"\s*:\s*"image_generation"/i.test(body) ||
    /"numberOfImages"\s*:/i.test(body)
  );
}

export function getProviderResponseLimit(
  input: RequestInfo | URL,
  init?: RequestInit,
): { maxResponseBytes: number; countDecodedText: boolean } {
  const url = input instanceof Request ? input.url : String(input);
  const body = getRequestBodyText(init);
  if (isStreamingRequest(url, body)) {
    return {
      maxResponseBytes: PROVIDER_RESPONSE_LIMITS.streamBytes,
      countDecodedText: true,
    };
  }
  return {
    maxResponseBytes: isImageRequest(url, body)
      ? PROVIDER_RESPONSE_LIMITS.imageBytes
      : PROVIDER_RESPONSE_LIMITS.textBytes,
    countDecodedText: false,
  };
}

function normalizeProviderRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string | URL; init?: RequestInit } {
  if (!(input instanceof Request)) return { url: input, init };
  return {
    url: input.url,
    init: {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: input.signal,
      ...init,
    },
  };
}

export function createProviderTransportFetch(): ProviderFetch {
  return async (input, init) => {
    const request = normalizeProviderRequest(input, init);
    const limit = getProviderResponseLimit(input, init);
    return safeFetch(request.url, request.init, {
      policy: getSafeUrlPolicy("provider"),
      timeoutMs: getChatProviderTimeoutMs(),
      maxResponseBytes: limit.maxResponseBytes,
      enforceResponseLimits: true,
      countDecodedText: limit.countDecodedText,
    });
  };
}

export function installGoogleProviderTransport(
  client: GoogleGenAI,
): GoogleGenAI {
  const apiClient = (client as unknown as GoogleApiClientWithFetch).apiClient;
  if (!apiClient?.apiCall) {
    throw new Error("Google provider SDK does not expose its transport hook");
  }
  const providerFetch = createProviderTransportFetch();
  apiClient.apiCall = (url, requestInit) => providerFetch(url, requestInit);
  return client;
}
