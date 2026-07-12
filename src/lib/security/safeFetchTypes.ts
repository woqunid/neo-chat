import type { SafeUrlPolicy } from "./urlPolicy";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_REDIRECTS = 5;

export interface SafeFetchOptions {
  policy?: SafeUrlPolicy;
  timeoutMs?: number;
  maxResponseBytes?: number;
  enforceResponseLimits?: boolean;
  countDecodedText?: boolean;
  signal?: AbortSignal;
}

export interface SafeFetchTextResult {
  response: Response;
  text: string;
  url: string;
}

export interface SafeFetchArrayBufferResult {
  response: Response;
  arrayBuffer: ArrayBuffer;
  url: string;
}
