import { v7 as uuidv7 } from "uuid";
import type { ToolCall } from "@/types";
import { supportsImageGeneration } from "@/lib/utils/model";
import { cacheGeneratedImageAttachments } from "../../../lib/utils/generatedImages";
import { boundHistoryForRequest } from "../../../lib/chat/requestContextBudget";
import {
  getResponseErrorMessage,
  signedApiFetch,
} from "../../../lib/api/client";
import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "../../../lib/byok/client";
import { logDevError } from "../../../lib/utils/devLogger";
import { ChatStreamRuntime } from "./streamRuntime";
import type { ChatRoundResult } from "./streamTypes";

class RoundEventHandler {
  content = "";
  reasoning = "";
  readonly toolCalls: ToolCall[] = [];

  constructor(private readonly runtime: ChatStreamRuntime) {}

  private emit(): void {
    this.runtime.emitContent(this.content, this.reasoning);
  }

  private handleToolCall(parsed: any): void {
    const toolCall: ToolCall = {
      id: parsed.toolCall?.id || uuidv7(),
      name: parsed.toolCall?.name,
      args: parsed.toolCall?.args ?? {},
      status: parsed.toolCall?.status || "pending",
    };
    this.toolCalls.push(toolCall);
    this.runtime.output.appendToolCall(toolCall);
    this.runtime.emitBlocks();
    this.runtime.upsertToolCall(toolCall);
  }

  private async handleImage(parsed: any): Promise<void> {
    if (!parsed.image) return;
    const [image] = await cacheGeneratedImageAttachments([parsed.image]);
    this.runtime.output.appendImage(image);
    this.emit();
  }

  private handleUsage(parsed: any): void {
    const usage = parsed.usage || parsed.usageMetadata;
    if (!usage || !this.runtime.prepared.options.onUsage) return;
    if (parsed.usage) this.runtime.prepared.options.onUsage({ usage });
    else this.runtime.prepared.options.onUsage({ usageMetadata: usage });
  }

  private handleSimpleEvent(parsed: any): boolean {
    if (parsed.type === "content") {
      this.content += parsed.content;
      this.runtime.output.appendText(parsed.content);
      this.emit();
    } else if (parsed.type === "reasoning") {
      this.reasoning += parsed.content;
      this.runtime.output.appendReasoning(parsed.content);
      this.emit();
    } else if (parsed.type === "tool_result" && parsed.toolCall) {
      this.runtime.updateToolCall(parsed.toolCall);
    } else if (parsed.type === "search") {
      this.runtime.trackSearch(parsed.isSearching, parsed.results);
    } else if (parsed.type === "usage") {
      this.handleUsage(parsed);
    } else {
      return false;
    }
    return true;
  }

  async handle(data: string): Promise<boolean> {
    if (!data || data === "[DONE]") return false;
    const parsed = JSON.parse(data);
    if (this.handleSimpleEvent(parsed)) return false;
    if (parsed.type === "tool_call") this.handleToolCall(parsed);
    else if (parsed.type === "image") await this.handleImage(parsed);
    else if (parsed.type === "error") throw new Error(parsed.error);
    else if (parsed.type === "done") {
      if (this.runtime.output.finalizeActiveReasoning()) {
        this.runtime.emitBlocks();
      }
      return true;
    }
    return false;
  }

  result(): ChatRoundResult {
    return {
      content: this.content,
      reasoning: this.reasoning,
      toolCalls: this.toolCalls,
    };
  }
}

async function processSseEvent(
  event: string,
  handler: RoundEventHandler,
): Promise<boolean> {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (!data) return false;
  try {
    return await handler.handle(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logDevError("Failed to parse SSE data:", error);
      return false;
    }
    throw error;
  }
}

async function processSseEvents(
  events: string[],
  handler: RoundEventHandler,
): Promise<boolean> {
  for (const event of events) {
    if (await processSseEvent(event, handler)) return true;
  }
  return false;
}

async function readRoundResponse(
  response: Response,
  runtime: ChatStreamRuntime,
): Promise<ChatRoundResult> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");
  const handler = new RoundEventHandler(runtime);
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    if (await processSseEvents(events, handler)) return handler.result();
  }
  if (buffer.trim()) await processSseEvent(buffer, handler);
  if (runtime.output.finalizeActiveReasoning()) runtime.emitBlocks();
  return handler.result();
}

async function requestRound(runtime: ChatStreamRuntime): Promise<Response> {
  const prepared = runtime.prepared;
  const boundedRequestHistory = boundHistoryForRequest(runtime.requestHistory, {
    newMessage: runtime.requestMessage,
    attachments: runtime.requestAttachments,
    systemInstruction: prepared.options.userSystemInstruction,
    tools: prepared.tools,
    modelInputTokenLimit: prepared.selectedModelMetadata?.limit?.context,
    reservedOutputTokens: prepared.selectedModelMetadata?.limit?.output,
  });
  return fetchWithByokRetry(async () =>
    signedApiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: await buildProviderRuntimeConfig(prepared.provider),
        modelName: prepared.modelName,
        history: boundedRequestHistory,
        newMessage: runtime.requestMessage,
        attachments: runtime.requestAttachments,
        config: runtime.requestConfig,
        systemInstruction: prepared.options.userSystemInstruction,
        tools: prepared.tools,
        enableImageGeneration:
          supportsImageGeneration(prepared.selectedModelMetadata) &&
          (prepared.provider.type === "OpenAI" ||
            prepared.provider.type === "Gemini"),
      }),
      signal: prepared.options.signal,
    }),
  );
}

export async function runChatRound(
  runtime: ChatStreamRuntime,
): Promise<ChatRoundResult> {
  const response = await requestRound(runtime);
  const isSse = response.headers
    .get("content-type")
    ?.includes("text/event-stream");
  if (!response.ok && !isSse) {
    throw new Error(
      await getResponseErrorMessage(response, "Stream request failed"),
    );
  }
  return readRoundResponse(response, runtime);
}
