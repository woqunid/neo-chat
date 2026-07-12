import type { ModelInfo } from "@/services/api/chatService";
import type { Attachment, Message, Session } from "@/types";

import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import type { PreparedChatPrompt, StreamResponseRequest } from "./shared";

export interface NewTurn {
  session: Session;
  prepared: PreparedChatPrompt;
  userMessage: Message;
  modelMessage: Message;
  history: Message[];
}

export interface FailureProgress {
  userMessageAdded: boolean;
  modelMessageId: string | null;
  startTime: number;
}

export interface SendMessageOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  availableModels: ModelInfo[];
  isGeneratingRef: React.MutableRefObject<boolean>;
  processPrompt: (request: {
    session?: Session | null;
    text: string;
    attachments: Attachment[];
    signal?: AbortSignal;
  }) => Promise<PreparedChatPrompt>;
  commitMemory: (request: {
    sessionId: string;
    session?: Session | null;
    ids: string[];
  }) => void;
  streamResponse: (request: StreamResponseRequest) => Promise<boolean>;
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
  markAborted: (request: {
    sessionId: string;
    messageId: string;
    logMessage: string;
  }) => Promise<void>;
  runPostGeneration: (request: {
    sessionId: string;
    modelMessageId: string;
    userMessage: Pick<Message, "id" | "content">;
    shouldAutoRename: boolean;
  }) => void;
}

export interface SendRequest {
  text: string;
  attachments: Attachment[];
  requestedSessionId?: string;
}
