import {
  Modality,
  type GenerateContentConfig,
  type GenerateContentParameters,
} from "@google/genai";
import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { normalizeGeneratedImageAttachment } from "../utils/generatedImages";
import type { GeminiStreamOptions } from "./gemini";
import type { SSEMessage } from "./sse";
import { finalizeStreamedToolCall } from "./toolCalls";

export interface GeminiStreamState {
  emittedToolCalls: number;
  receivedFinishReason: boolean;
}

export function createGeminiStreamState(): GeminiStreamState {
  return { emittedToolCalls: 0, receivedFinishReason: false };
}

function appendImageCountInstruction(
  instruction: string | undefined,
  imageCount: number | undefined,
): string | undefined {
  if (!imageCount) return instruction;
  const suffix = imageCount === 1 ? "" : "s";
  const imageInstruction = `When generating images for this request, create ${imageCount} separate image output${suffix}.`;
  return instruction
    ? `${instruction}\n\n${imageInstruction}`
    : imageInstruction;
}

function createGeminiConfig(
  options: GeminiStreamOptions,
): GenerateContentConfig {
  const config: GenerateContentConfig = {};
  const instruction = appendImageCountInstruction(
    options.systemInstruction,
    options.enableImageGeneration ? options.imageCount : undefined,
  );
  if (instruction) config.systemInstruction = instruction;
  if (options.temperature !== undefined) {
    config.temperature = options.temperature;
  }
  const tools: NonNullable<GenerateContentConfig["tools"]> = [];
  if (options.tools?.length)
    tools.push({ functionDeclarations: options.tools });
  if (tools.length) config.tools = tools;
  if (options.enableImageGeneration) {
    config.responseModalities = [Modality.TEXT, Modality.IMAGE];
  }
  if (options.signal) config.abortSignal = options.signal;
  return config;
}

export function createGeminiRequestParams(
  options: GeminiStreamOptions,
): GenerateContentParameters {
  return {
    model: options.model,
    contents: options.contents,
    config: createGeminiConfig(options),
  };
}

function hasValidFinishReason(candidates: any): boolean {
  if (!Array.isArray(candidates)) return false;
  return candidates.some((candidate) => {
    if (typeof candidate?.finishReason !== "string") return false;
    const reason = candidate.finishReason.trim().toUpperCase();
    return (
      reason.length > 0 &&
      reason !== "FINISH_REASON_UNSPECIFIED" &&
      reason !== "UNSPECIFIED"
    );
  });
}

function emitFunctionCall(
  functionCall: any,
  state: GeminiStreamState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (state.emittedToolCalls >= PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls) {
    return;
  }
  const position = state.emittedToolCalls;
  state.emittedToolCalls += 1;
  const toolCall = finalizeStreamedToolCall(
    {
      id: `call_${Date.now()}_${position}`,
      name: functionCall.name,
      args: functionCall.args,
    },
    position,
  );
  if (toolCall) onChunk({ type: "tool_call", toolCall });
}

function emitInlineImage(
  inlineData: any,
  onChunk: (message: SSEMessage) => void,
): void {
  const image = normalizeGeneratedImageAttachment({
    id: `img_${Date.now()}`,
    mimeType: inlineData.mimeType,
    data: inlineData.data,
    fileName: `generated-${Date.now()}.png`,
  });
  if (image) onChunk({ type: "image", image });
}

function processPart(
  part: any,
  state: GeminiStreamState,
  onChunk: (message: SSEMessage) => void,
): void {
  if (part.thought && part.text) {
    onChunk({ type: "reasoning", content: part.text });
  } else if (part.functionCall) {
    emitFunctionCall(part.functionCall, state, onChunk);
  } else if (part.text) {
    onChunk({ type: "content", content: part.text });
  } else if (part.inlineData) {
    emitInlineImage(part.inlineData, onChunk);
  }
}

export function processGeminiChunk(
  chunk: any,
  state: GeminiStreamState,
  onChunk: (message: SSEMessage) => void,
): void {
  const candidates = chunk?.candidates;
  if (hasValidFinishReason(candidates)) state.receivedFinishReason = true;
  const parts = candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    for (const part of parts) processPart(part, state, onChunk);
  }
  if (chunk?.usageMetadata) {
    onChunk({ type: "usage", usageMetadata: chunk.usageMetadata });
  }
}
