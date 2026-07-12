import { ResponseSizeLimitError } from "./safeFetchErrors";
import { getAbortReason } from "./safeFetchLifecycle";

interface LimitedResponseOptions {
  signal: AbortSignal;
  maxResponseBytes: number;
  countDecodedText?: boolean;
  cleanup(): void;
}

function joinChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readResponseWithLimit(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (signal.aborted) throw getAbortReason(signal);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new ResponseSizeLimitError(maxBytes);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const abort = () => void reader.cancel(getAbortReason(signal));
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw getAbortReason(signal);
      const { done, value } = await reader.read();
      if (signal.aborted) throw getAbortReason(signal);
      if (done) return joinChunks(chunks, total);
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ResponseSizeLimitError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

class LimitedResponseBody {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder?: TextDecoder;
  private readonly encoder?: TextEncoder;
  private controller?: ReadableStreamDefaultController<Uint8Array>;
  private total = 0;
  private cleaned = false;

  constructor(
    body: ReadableStream<Uint8Array>,
    private readonly options: LimitedResponseOptions,
  ) {
    this.reader = body.getReader();
    if (options.countDecodedText) {
      this.decoder = new TextDecoder();
      this.encoder = new TextEncoder();
    }
  }

  start(controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.controller = controller;
    this.options.signal.addEventListener("abort", this.abort, { once: true });
    if (this.options.signal.aborted) this.abort();
  }

  async pull(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (this.options.signal.aborted) return this.abort();
    try {
      const { done, value } = await this.reader.read();
      if (this.options.signal.aborted) return this.abort();
      if (done) return this.close(controller);
      if (!value) return;
      this.total += this.countBytes(value);
      if (this.total > this.options.maxResponseBytes) {
        return await this.exceedLimit(controller);
      }
      controller.enqueue(value);
    } catch (error) {
      controller.error(
        this.options.signal.aborted
          ? getAbortReason(this.options.signal)
          : error,
      );
      this.cleanup();
    }
  }

  cancel(reason: unknown): Promise<void> {
    this.cleanup();
    return this.reader.cancel(reason);
  }

  private readonly abort = () => {
    const error = getAbortReason(this.options.signal);
    void this.reader.cancel(error).catch(() => undefined);
    this.controller?.error(error);
    this.cleanup();
  };

  private countBytes(value: Uint8Array): number {
    if (!this.decoder || !this.encoder) return value.byteLength;
    return this.encoder.encode(this.decoder.decode(value, { stream: true }))
      .byteLength;
  }

  private close(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (this.decoder && this.encoder) {
      this.total += this.encoder.encode(this.decoder.decode()).byteLength;
    }
    if (this.total > this.options.maxResponseBytes) {
      controller.error(
        new ResponseSizeLimitError(this.options.maxResponseBytes),
      );
    } else {
      controller.close();
    }
    this.cleanup();
  }

  private async exceedLimit(
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) {
    const error = new ResponseSizeLimitError(this.options.maxResponseBytes);
    await this.reader.cancel(error).catch(() => undefined);
    controller.error(error);
    this.cleanup();
  }

  private cleanup(): void {
    if (this.cleaned) return;
    this.cleaned = true;
    this.options.signal.removeEventListener("abort", this.abort);
    this.options.cleanup();
  }
}

export function wrapLimitedResponse(
  response: Response,
  options: LimitedResponseOptions,
): Response {
  if (!response.body) {
    options.cleanup();
    return response;
  }
  const source = new LimitedResponseBody(response.body, options);
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => source.start(controller),
    pull: (controller) => source.pull(controller),
    cancel: (reason) => source.cancel(reason),
  });
  const limited = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  Object.defineProperty(limited, "url", { value: response.url });
  return limited;
}
