import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const safeFetchMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("../lib/security/safeFetch", () => ({ safeFetch: safeFetchMock }));
vi.mock("../lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createRequest(body: unknown) {
  return new NextRequest("https://neo.test/api/media/image-proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("message image proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchMock.mockReset();
  });

  it("returns validated raster image bytes", async () => {
    safeFetchMock.mockResolvedValue(
      new Response(PNG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/image.png" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES);
    expect(safeFetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: "GET" }),
      expect.objectContaining({
        enforceResponseLimits: true,
        maxResponseBytes: 10 * 1024 * 1024,
      }),
    );
  });

  it("rejects content that does not match the declared image type", async () => {
    safeFetchMock.mockResolvedValue(
      new Response("not an image", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );
    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/image.png" }),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      code: "IMAGE_CONTENT_MISMATCH",
    });
  });
});
