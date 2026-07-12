import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProviderTransportFetch,
  getProviderResponseLimit,
  PROVIDER_RESPONSE_LIMITS,
} from "../lib/providers/transport";

vi.mock("server-only", () => ({}));

const PUBLIC_TEST_URL = "https://93.184.216.34/v1/chat/completions";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("provider transport response limits", () => {
  it("classifies text, image, and streaming provider requests", () => {
    expect(getProviderResponseLimit(PUBLIC_TEST_URL).maxResponseBytes).toBe(
      PROVIDER_RESPONSE_LIMITS.textBytes,
    );
    expect(
      getProviderResponseLimit("https://93.184.216.34/v1/images/generations")
        .maxResponseBytes,
    ).toBe(PROVIDER_RESPONSE_LIMITS.imageBytes);
    expect(
      getProviderResponseLimit(PUBLIC_TEST_URL, {
        body: JSON.stringify({ stream: true }),
      }),
    ).toEqual({
      maxResponseBytes: PROVIDER_RESPONSE_LIMITS.streamBytes,
      countDecodedText: true,
    });
  });

  it("surfaces ResponseSizeLimitError from the injected SDK transport", async () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "0");
    const oversized = "x".repeat(PROVIDER_RESPONSE_LIMITS.textBytes + 1);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(oversized),
    );

    const response = await createProviderTransportFetch()(PUBLIC_TEST_URL);
    await expect(response.text()).rejects.toMatchObject({
      name: "ResponseSizeLimitError",
      code: "RESPONSE_SIZE_LIMIT",
      maxBytes: PROVIDER_RESPONSE_LIMITS.textBytes,
    });
  });

  it("keeps caller cancellation when provider timeout is disabled", async () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "0");
    const caller = new AbortController();
    const transportSignals: AbortSignal[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_, init) => {
      if (init?.signal) transportSignals.push(init.signal);
      caller.abort();
      return new Response("ok");
    });

    const response = await createProviderTransportFetch()(PUBLIC_TEST_URL, {
      signal: caller.signal,
    });
    await expect(response.text()).rejects.toMatchObject({ name: "AbortError" });
    expect(transportSignals[0]?.aborted).toBe(true);
  });
});
