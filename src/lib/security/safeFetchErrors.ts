import { ApiError } from "../errors";

export class ResponseSizeLimitError extends ApiError {
  constructor(readonly maxBytes: number) {
    super(
      `Upstream response exceeded ${maxBytes} bytes`,
      502,
      "RESPONSE_SIZE_LIMIT",
      { maxBytes },
    );
    this.name = "ResponseSizeLimitError";
  }
}
