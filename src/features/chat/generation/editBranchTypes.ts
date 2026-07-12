import type { ModelInfo } from "@/services/api/chatService";
import type { Attachment, Message, Session } from "@/types";

import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import type { PreparedChatPrompt, StreamResponseRequest } from "./shared";

export interface EditSource {
  sessionId: string;
  sourceMessage: Message;
  messageIndex: number;
  messages: Message[];
  session?: Session | null;
}

export interface EditBranch {
  userMessageId: string;
  modelMessageId: string;
  startTime: number;
}

export interface EditBranchOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  availableModels: ModelInfo[];
  isGenerating: boolean;
  processPrompt: (request: {
    session?: Session | null;
    text: string;
    attachments: Attachment[];
  }) => Promise<PreparedChatPrompt>;
  commitMemory: (request: {
    sessionId: string;
    session?: Session | null;
    ids: string[];
  }) => void;
  prepareResponseHistory: (request: {
    messages: Message[];
    compression?: Session["compression"];
    generation: ActiveGenerationRun;
  }) => Promise<Message[] | null>;
  resolveResponseSkills: (request: {
    promptText: string;
    prepared: PreparedChatPrompt;
    generation: ActiveGenerationRun;
  }) => Promise<StreamResponseRequest["skills"] | null>;
  streamResponse: (request: StreamResponseRequest) => Promise<boolean>;
  markAborted: (request: {
    sessionId: string;
    messageId: string;
    logMessage: string;
  }) => Promise<void>;
  syncWithNotice: (request: {
    sessionId: string;
    logMessage: string;
  }) => Promise<void>;
  queueMemoryExtraction: (request: {
    sessionId: string;
    user: Pick<Message, "id" | "content">;
    assistant: Pick<Message, "id" | "content">;
  }) => void;
  showActionError: (message: string) => void;
}
