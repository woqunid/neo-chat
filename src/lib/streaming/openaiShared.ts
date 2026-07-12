import type { SSEMessage } from "./sse";
import {
  createProviderRequestSignal,
  getChatProviderTimeoutMs,
} from "../providers/requestTimeout";
import { normalizeGeneratedImageAttachment } from "../utils/generatedImages";

export function extractOpenAIText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractOpenAIText).join("");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return (
    extractOpenAIText(record.text) ||
    extractOpenAIText(record.content) ||
    extractOpenAIText(record.summary) ||
    extractOpenAIText(record.delta)
  );
}

export function extractReasoningSummary(item: any): string {
  return [item?.summary, item?.content, item?.text]
    .map(extractOpenAIText)
    .filter(Boolean)
    .join("");
}

export async function createOpenAIStreamRequest(
  create: (
    params: any,
    options: { maxRetries: number; timeout?: number; signal?: AbortSignal },
  ) => Promise<unknown>,
  params: any,
  callerSignal?: AbortSignal,
): Promise<unknown> {
  const timeout = getChatProviderTimeoutMs();
  const signal = createProviderRequestSignal(timeout, callerSignal);
  return create(params, {
    maxRetries: 0,
    ...(timeout > 0 ? { timeout } : {}),
    ...(signal ? { signal } : {}),
  });
}

function extractImageData(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const data = extractImageData(item);
      if (data) return data;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return extractImageData([
    record.result,
    record.image,
    record.b64_json,
    record.data,
    record.partial_image_b64,
    record.base64,
  ]);
}

function firstTruthy(values: any[]): any {
  return values.find(Boolean);
}

function toRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object"
    ? (value as Record<string, any>)
    : {};
}

export function emitOpenAIImage(
  event: any,
  onChunk: (message: SSEMessage) => void,
): boolean {
  const eventRecord = toRecord(event);
  const item = toRecord(
    firstTruthy([eventRecord.item, eventRecord.output, eventRecord]),
  );
  const data = extractImageData([item, eventRecord]);
  const image = normalizeGeneratedImageAttachment({
    id: firstTruthy([item.id, eventRecord.item_id, eventRecord.id]),
    mimeType: firstTruthy([
      item.mime_type,
      item.mimeType,
      eventRecord.mime_type,
    ]),
    data,
    fileName: firstTruthy([
      item.file_name,
      item.fileName,
      "generated-image.png",
    ]),
  });
  if (!image) return false;
  onChunk({ type: "image", image });
  return true;
}

export function emitStreamTiming(
  startTime: number,
  onChunk: (message: SSEMessage) => void,
): void {
  const endTime = Date.now();
  onChunk({
    type: "timing",
    timing: { startTime, endTime, duration: endTime - startTime },
  });
}
