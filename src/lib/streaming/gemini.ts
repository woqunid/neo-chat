import type { GoogleGenAI } from "@google/genai";
import { IncompleteProviderStreamError } from "../errors";
import {
  createGeminiRequestParams,
  createGeminiStreamState,
  processGeminiChunk,
} from "./geminiStream";
import type { SSEMessage } from "./sse";

export interface GeminiStreamOptions {
  client: GoogleGenAI;
  model: string;
  contents: any[];
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
  enableImageGeneration?: boolean;
  imageCount?: number;
  signal?: AbortSignal;
  onChunk: (message: SSEMessage) => void;
}

export async function streamGeminiResponse(
  options: GeminiStreamOptions,
): Promise<void> {
  const startTime = Date.now();
  const stream = await options.client.models.generateContentStream(
    createGeminiRequestParams(options),
  );
  const state = createGeminiStreamState();
  for await (const chunk of stream) {
    processGeminiChunk(chunk, state, options.onChunk);
  }
  if (!state.receivedFinishReason) {
    throw new IncompleteProviderStreamError(
      "Gemini stream ended before a valid candidate finishReason.",
    );
  }
  const endTime = Date.now();
  options.onChunk({
    type: "timing",
    timing: { startTime, endTime, duration: endTime - startTime },
  });
}
