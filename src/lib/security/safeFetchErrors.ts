import { ApiError } from "../errors";

export class ResponseSizeLimitError extends ApiError {
  constructor(readonly maxBytes: number) {
    super(`Upstream response exceeded ${maxBytes} bytes`, {
      statusCode: 502,
      code: "RESPONSE_SIZE_LIMIT",
      details: { maxBytes },
    });
    this.name = "ResponseSizeLimitError";
  }
}
