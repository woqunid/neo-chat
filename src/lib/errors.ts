/**
 * 统一的错误处理类
 */

import { logDevError } from "./utils/devLogger";

export interface ApiErrorOptions {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code;
    this.details = options.details;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
    this.name = "ValidationError";
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message: string = "Request body is too large") {
    super(message, { statusCode: 413, code: "PAYLOAD_TOO_LARGE" });
    this.name = "PayloadTooLargeError";
  }
}

export class LengthRequiredError extends ApiError {
  constructor(message: string = "Content-Length header is required") {
    super(message, { statusCode: 411, code: "LENGTH_REQUIRED" });
    this.name = "LengthRequiredError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = "API key not configured") {
    super(message, { statusCode: 401, code: "AUTH_ERROR" });
    this.name = "AuthenticationError";
  }
}

export class ProviderError extends ApiError {
  constructor(
    message: string,
    public provider: string,
    details?: Record<string, unknown>,
  ) {
    super(message, {
      statusCode: 502,
      code: "PROVIDER_ERROR",
      details: { provider, ...details },
    });
    this.name = "ProviderError";
  }
}

export class IncompleteProviderStreamError extends ApiError {
  constructor(message: string) {
    super(message, { statusCode: 502, code: "INCOMPLETE_PROVIDER_STREAM" });
    this.name = "IncompleteProviderStreamError";
  }
}

export class ResponseTimeoutError extends ApiError {
  constructor(
    readonly timeoutMs: number,
    label = "Upstream response",
  ) {
    super(`${label} timed out after ${timeoutMs}ms`, {
      statusCode: 504,
      code: "RESPONSE_TIMEOUT",
      details: { timeoutMs },
    });
    this.name = "ResponseTimeoutError";
  }
}

export class HostedProxyBlockedError extends ApiError {
  constructor(
    message: string = "Hosted deployments cannot proxy local network URLs",
  ) {
    super(message, { statusCode: 403, code: "HOSTED_PROXY_BLOCKED" });
    this.name = "HostedProxyBlockedError";
  }
}

export interface PublicErrorPayload {
  error: string;
  code: string;
  statusCode: number;
  details?: unknown;
}

const SENSITIVE_QUERY_RE =
  /([?&][^=]*(?:key|token|secret|auth|password)[^=]*=)[^&\s]*/gi;
const SENSITIVE_JSON_RE =
  /("(?:apiKey|token|secret|password|authorization|wrappedKey|ciphertext|iv)"\s*:\s*)"[^"]*"/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_RE, "$1[redacted]")
    .replace(SENSITIVE_JSON_RE, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

export function toPublicErrorPayload(error: unknown): PublicErrorPayload {
  if (error instanceof ApiError) {
    return {
      error: redactSensitiveText(error.message),
      code: error.code || "API_ERROR",
      statusCode: error.statusCode,
      details: error.details,
    };
  }

  if (
    error instanceof Error &&
    (error.name === "ZodError" || "issues" in error)
  ) {
    return {
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details: "issues" in error ? error.issues : undefined,
    };
  }

  return {
    error: "An internal error occurred. Please try again.",
    code: "INTERNAL_ERROR",
    statusCode: 500,
  };
}

/**
 * 错误处理工具函数
 */
export function handleApiError(error: unknown): Response {
  logDevError("API Error:", error);
  const payload = toPublicErrorPayload(error);
  return Response.json(payload, { status: payload.statusCode });
}
