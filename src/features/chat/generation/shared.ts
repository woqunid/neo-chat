import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { EffectiveChatContext } from "@/lib/chat/effectiveChatContext";
import type { ProcessedMessageData } from "@/lib/chat/messageProcessor";
import type { resolveSkillsForMessage } from "@/services/api/skillService";
import type { Attachment, Message, Session } from "@/types";

export interface PreparedChatPrompt extends ProcessedMessageData {
  effectiveContext: EffectiveChatContext;
  injectedMemoryIds: string[];
}

export interface PromptRequest {
  session?: Session | null;
  text: string;
  attachments: Attachment[];
}

export interface StreamResponseRequest {
  sessionId: string;
  userMessageId: string;
  modelMessageId: string;
  promptText: string;
  prepared: PreparedChatPrompt;
  history: Message[];
  skills: Awaited<ReturnType<typeof resolveSkillsForMessage>>;
  generation: ActiveGenerationRun;
}

export interface PrepareHistoryRequest {
  messages: Message[];
  compression?: Session["compression"];
  generation: ActiveGenerationRun;
}

export interface ResolveSkillsRequest {
  promptText: string;
  prepared: PreparedChatPrompt;
  generation: ActiveGenerationRun;
}

export function createGenerationTiming(startTime: number, endTime: number) {
  return { startTime, endTime, duration: endTime - startTime };
}

export function getGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "An unknown error occurred.";
}

export function isGenerationAbort(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted || (error instanceof Error && error.name === "AbortError")
  );
}
