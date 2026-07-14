import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "../../../../lib/api/middleware";
import { MessageImageProxyRequestSchema } from "../../../../lib/api/schemas";
import { ApiError } from "../../../../lib/errors";
import { safeFetch } from "../../../../lib/security/safeFetch";
import {
  getSafeUrlPolicy,
  validateOutboundUrl,
} from "../../../../lib/security/urlPolicy";
import { safeServerLogError } from "../../../../lib/utils/safeServerLog";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * 1024;
const FETCH_TIMEOUT_MS = 20_000;
const IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function errorResponse(error: string, status: number, code: string) {
  return NextResponse.json(
    { error, code, statusCode: status },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string) {
  return hasBytes(
    bytes,
    offset,
    Array.from(expected, (character) => character.charCodeAt(0)),
  );
}

function matchesAvif(bytes: Uint8Array) {
  if (!hasAscii(bytes, 4, "ftyp")) return false;
  const limit = Math.min(bytes.length, 32);
  for (let offset = 8; offset + 4 <= limit; offset += 4) {
    if (hasAscii(bytes, offset, "avif") || hasAscii(bytes, offset, "avis")) {
      return true;
    }
  }
  return false;
}

function matchesImageSignature(bytes: Uint8Array, contentType: string) {
  const matchers: Record<string, () => boolean> = {
    "image/png": () =>
      hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    "image/jpeg": () => hasBytes(bytes, 0, [0xff, 0xd8, 0xff]),
    "image/gif": () =>
      hasAscii(bytes, 0, "GIF87a") || hasAscii(bytes, 0, "GIF89a"),
    "image/webp": () =>
      hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP"),
    "image/avif": () => matchesAvif(bytes),
  };
  return matchers[contentType]?.() ?? false;
}

async function fetchImage(request: NextRequest) {
  const body = await readJsonRequestBody(request, MAX_REQUEST_BYTES);
  const { url: sourceUrl } = MessageImageProxyRequestSchema.parse(body);
  const policy = getSafeUrlPolicy("image");
  const { url } = validateOutboundUrl(sourceUrl, policy);
  return safeFetch(
    url,
    { method: "GET", headers: { Accept: "image/*" }, signal: request.signal },
    {
      policy,
      enforceResponseLimits: true,
      timeoutMs: FETCH_TIMEOUT_MS,
      maxResponseBytes: MAX_IMAGE_BYTES,
    },
  );
}

async function readValidatedImage(response: Response) {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError("The upstream image could not be fetched", {
      statusCode: 502,
      code: "UPSTREAM_IMAGE_FETCH_FAILED",
    });
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !IMAGE_TYPES.has(contentType)) {
    await response.body?.cancel();
    throw new ApiError("The upstream response is not a supported image", {
      statusCode: 415,
      code: "UNSUPPORTED_IMAGE_CONTENT_TYPE",
    });
  }
  const bytes = await response.arrayBuffer();
  if (!matchesImageSignature(new Uint8Array(bytes), contentType)) {
    throw new ApiError(
      "The upstream response does not match its declared image type",
      { statusCode: 415, code: "IMAGE_CONTENT_MISMATCH" },
    );
  }
  return { bytes, contentType };
}

export async function POST(request: NextRequest) {
  try {
    const response = await fetchImage(request);
    const { bytes, contentType } = await readValidatedImage(response);
    return new NextResponse(bytes, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      request.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return new Response(null, { status: 499 });
    }
    if (error instanceof ApiError && error.statusCode < 500) {
      return errorResponse(
        error.message,
        error.statusCode,
        error.code ?? "IMAGE_PROXY_FAILED",
      );
    }
    safeServerLogError("Message image proxy error:", error);
    return createApiErrorResponse(error, "Image proxy failed");
  }
}
