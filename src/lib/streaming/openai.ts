import type OpenAI from "openai";
import type { SSEMessage } from "./sse";
import { streamOpenAIChat } from "./openaiChat";
import { streamOpenAIResponsesApi } from "./openaiResponses";

export interface OpenAIStreamOptions {
  client: OpenAI;
  model: string;
  messages: any[];
  temperature?: number;
  tools?: any[];
  signal?: AbortSignal;
  onChunk: (message: SSEMessage) => void;
}

export interface OpenAIResponsesStreamOptions {
  client: OpenAI;
  model: string;
  input: any[];
  instructions?: string;
  temperature?: number;
  tools?: any[];
  enableImageGeneration?: boolean;
  signal?: AbortSignal;
  onChunk: (message: SSEMessage) => void;
}

export async function streamOpenAIChatCompletions(
  options: OpenAIStreamOptions,
): Promise<void> {
  await streamOpenAIChat(options);
}

export const streamOpenAIResponse = streamOpenAIChatCompletions;

export async function streamOpenAIResponses(
  options: OpenAIResponsesStreamOptions,
): Promise<void> {
  await streamOpenAIResponsesApi(options);
}
