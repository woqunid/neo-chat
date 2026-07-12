import { afterEach, describe, expect, it, vi } from "vitest";
import { getSafeUrlPolicy } from "../lib/security/urlPolicy";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("safe fetch response lifecycle limits", () => {
  it("keeps the timeout active until a limited response body is consumed", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new ReadableStream()),
    );
    const { safeFetch } = await import("../lib/security/safeFetch");
    const response = await safeFetch(
      "https://93.184.216.34/stream",
      {},
      {
        policy: getSafeUrlPolicy("plugin"),
        timeoutMs: 25,
        enforceResponseLimits: true,
      },
    );
    const expectation = expect(response.text()).rejects.toMatchObject({
      name: "ResponseTimeoutError",
      code: "RESPONSE_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });

  it("surfaces a structured error when a streamed response is too large", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("response exceeds limit"),
    );
    const { safeFetch } = await import("../lib/security/safeFetch");
    const response = await safeFetch(
      "https://93.184.216.34/stream",
      {},
      {
        policy: getSafeUrlPolicy("plugin"),
        maxResponseBytes: 8,
        enforceResponseLimits: true,
        countDecodedText: true,
      },
    );

    await expect(response.text()).rejects.toMatchObject({
      name: "ResponseSizeLimitError",
      code: "RESPONSE_SIZE_LIMIT",
      maxBytes: 8,
    });
  });
});

describe("safe fetch response lifecycle limits", () => {
  it("uses the same structured size error for buffered helpers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("response exceeds limit"),
    );
    const { safeFetchText } = await import("../lib/security/safeFetch");

    await expect(
      safeFetchText(
        "https://93.184.216.34/data",
        {},
        {
          policy: getSafeUrlPolicy("plugin"),
          maxResponseBytes: 8,
        },
      ),
    ).rejects.toMatchObject({
      name: "ResponseSizeLimitError",
      code: "RESPONSE_SIZE_LIMIT",
      maxBytes: 8,
    });
  });
});
