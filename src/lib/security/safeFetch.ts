import "server-only";

import { ResponseTimeoutError } from "../errors";
import { redactUrl } from "./urlPolicy";
import { readResponseWithLimit, wrapLimitedResponse } from "./safeFetchBody";
import { ResponseSizeLimitError } from "./safeFetchErrors";
import {
  createSafeFetchLifecycle,
  throwIfLifecycleTimedOut,
  type SafeFetchLifecycle,
} from "./safeFetchLifecycle";
import { safeFetchResponse } from "./safeFetchRequest";
import type {
  SafeFetchArrayBufferResult,
  SafeFetchOptions,
  SafeFetchTextResult,
} from "./safeFetchTypes";
import { DEFAULT_MAX_RESPONSE_BYTES } from "./safeFetchTypes";
import { assertResolvedOutboundUrlAllowed } from "./safeFetchDns";
import { getSafeUrlPolicy, validateOutboundUrl } from "./urlPolicy";

export { ResponseTimeoutError, ResponseSizeLimitError };
export type { SafeFetchOptions } from "./safeFetchTypes";

async function runWithLifecycle<T>(
  lifecycle: SafeFetchLifecycle,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    return await operation(lifecycle.signal);
  } catch (error) {
    throwIfLifecycleTimedOut(lifecycle);
    throw error;
  } finally {
    lifecycle.cleanup();
  }
}

export async function safeFetch(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<Response> {
  const lifecycle = createSafeFetchLifecycle(options.timeoutMs, init.signal);
  let responseOwnsLifecycle = false;
  try {
    const response = await safeFetchResponse(
      input,
      init,
      options,
      lifecycle.signal,
    );
    if (!options.enforceResponseLimits || !response.body) return response;
    responseOwnsLifecycle = true;
    return wrapLimitedResponse(response, {
      signal: lifecycle.signal,
      maxResponseBytes: options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      countDecodedText: options.countDecodedText,
      cleanup: lifecycle.cleanup,
    });
  } catch (error) {
    throwIfLifecycleTimedOut(lifecycle);
    throw error;
  } finally {
    if (!responseOwnsLifecycle) lifecycle.cleanup();
  }
}

export async function assertOutboundUrlAllowed(
  input: string | URL,
  options: SafeFetchOptions = {},
): Promise<void> {
  const lifecycle = createSafeFetchLifecycle(options.timeoutMs, options.signal);
  await runWithLifecycle(lifecycle, async (signal) => {
    const policy = options.policy || getSafeUrlPolicy("plugin");
    const { url } = validateOutboundUrl(input, policy);
    await assertResolvedOutboundUrlAllowed(url, policy, signal);
  });
}

async function fetchResponseBytes(
  input: string | URL,
  init: RequestInit,
  options: SafeFetchOptions,
): Promise<{ response: Response; bytes: Uint8Array }> {
  const lifecycle = createSafeFetchLifecycle(options.timeoutMs, init.signal);
  return runWithLifecycle(lifecycle, async (signal) => {
    const response = await safeFetchResponse(input, init, options, signal);
    const bytes = await readResponseWithLimit(
      response,
      options.maxResponseBytes || DEFAULT_MAX_RESPONSE_BYTES,
      signal,
    );
    return { response, bytes };
  });
}

export async function safeFetchText(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<SafeFetchTextResult> {
  const { response, bytes } = await fetchResponseBytes(input, init, options);
  return {
    response,
    text: new TextDecoder().decode(bytes),
    url: redactUrl(response.url),
  };
}

export async function safeFetchJson<T = unknown>(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<{ response: Response; data: T; url: string }> {
  const { response, text, url } = await safeFetchText(input, init, options);
  try {
    return { response, data: JSON.parse(text) as T, url };
  } catch {
    throw new Error("Expected a JSON response from upstream service");
  }
}

export async function safeFetchArrayBuffer(
  input: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {},
): Promise<SafeFetchArrayBufferResult> {
  const { response, bytes } = await fetchResponseBytes(input, init, options);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return { response, arrayBuffer, url: redactUrl(response.url) };
}
