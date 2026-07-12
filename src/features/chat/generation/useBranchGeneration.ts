"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { getModelDisplayName } from "@/lib/chat/messageProcessor";
import { logDevError } from "@/lib/utils/devLogger";
import type { ModelInfo } from "@/services/api/chatService";
import { useChatStore } from "@/store/core/chatStore";
import type { Message, Session } from "@/types";

import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import type { PreparedChatPrompt, StreamResponseRequest } from "./shared";
import {
  createGenerationTiming,
  getGenerationErrorMessage,
  isGenerationAbort,
} from "./shared";

interface BranchContext {
  sessionId: string;
  branchMessageId: string;
  userMessage: Message;
  historyBeforeUser: Message[];
  session?: Session | null;
}

interface BranchGenerationOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  availableModels: ModelInfo[];
  isGenerating: boolean;
  processPrompt: (request: {
    session?: Session | null;
    text: string;
    attachments: import("@/types").Attachment[];
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

interface BranchRequest {
  messageId: string;
  errorMessage: string;
  logPrefix: string;
}

function createBranchContext(
  options: BranchGenerationOptions,
  request: BranchRequest,
): BranchContext | null {
  const sessionId = options.shell.chat.currentSessionId;
  if (options.isGenerating || !sessionId) return null;
  const messages = options.shell.chat.activeMessages;
  const messageIndex = messages.findIndex(
    (item) => item.id === request.messageId,
  );
  if (messageIndex < 0) return null;
  const history = messages.slice(0, messageIndex);
  const userMessage = history.at(-1);
  if (!userMessage || userMessage.role !== "user") {
    logDevError(
      `${request.logPrefix}: preceding message is not a user message.`,
    );
    options.showActionError(request.errorMessage);
    return null;
  }
  const modelName = getModelDisplayName(
    options.shell.chat.selectedModel,
    options.availableModels,
  );
  const branchMessageId = options.shell.chat.addMessageVersion(
    sessionId,
    request.messageId,
    modelName,
  );
  if (!branchMessageId) {
    options.showActionError(request.errorMessage);
    return null;
  }
  return {
    sessionId,
    branchMessageId,
    userMessage,
    historyBeforeUser: history.slice(0, -1),
    session: options.shell.chat.getCurrentSession(),
  };
}

async function streamBranch(
  options: BranchGenerationOptions,
  request: {
    context: BranchContext;
    prepared: PreparedChatPrompt;
    generation: ActiveGenerationRun;
  },
) {
  const skills = await options.resolveResponseSkills({
    promptText: request.context.userMessage.content,
    prepared: request.prepared,
    generation: request.generation,
  });
  if (!skills) return false;
  if (request.prepared.ragSources.length > 0) {
    options.shell.chat.updateMessage(
      request.context.sessionId,
      request.context.branchMessageId,
      { ragSources: request.prepared.ragSources },
    );
  }
  if (skills.invocations.length > 0) {
    options.shell.chat.updateMessage(
      request.context.sessionId,
      request.context.branchMessageId,
      { skillInvocations: skills.invocations },
    );
  }
  const history = await options.prepareResponseHistory({
    messages: request.context.historyBeforeUser,
    compression: request.context.session?.compression,
    generation: request.generation,
  });
  if (!history) return false;
  return options.streamResponse({
    sessionId: request.context.sessionId,
    userMessageId: request.context.userMessage.id,
    modelMessageId: request.context.branchMessageId,
    promptText: request.context.userMessage.content,
    prepared: request.prepared,
    history,
    skills,
    generation: request.generation,
  });
}

async function completeBranch(
  options: BranchGenerationOptions,
  request: { context: BranchContext; startTime: number },
) {
  const { context } = request;
  options.shell.chat.updateMessage(context.sessionId, context.branchMessageId, {
    generationStatus: "completed",
    timing: createGenerationTiming(request.startTime, Date.now()),
  });
  await options.shell.chat.syncActiveSession(context.sessionId);
  const message = useChatStore
    .getState()
    .activeMessages.find((item) => item.id === context.branchMessageId);
  if (!message) return;
  options.queueMemoryExtraction({
    sessionId: context.sessionId,
    user: context.userMessage,
    assistant: { id: message.id, content: message.content },
  });
}

async function handleBranchFailure(
  options: BranchGenerationOptions,
  request: {
    context: BranchContext;
    generation: ActiveGenerationRun;
    startTime: number;
    logPrefix: string;
    error: unknown;
  },
) {
  if (isGenerationAbort(request.error, request.generation.controller.signal)) {
    await options.markAborted({
      sessionId: request.context.sessionId,
      messageId: request.context.branchMessageId,
      logMessage: `Failed to persist aborted ${request.logPrefix.toLowerCase()} message`,
    });
    return;
  }
  logDevError(`${request.logPrefix} generation failed:`, request.error);
  options.shell.chat.updateMessage(
    request.context.sessionId,
    request.context.branchMessageId,
    {
      generationStatus: "failed",
      generationError: {
        message: getGenerationErrorMessage(request.error),
        recoverable: true,
      },
      timing: createGenerationTiming(request.startTime, Date.now()),
    },
  );
  await options.syncWithNotice({
    sessionId: request.context.sessionId,
    logMessage: `Failed to persist ${request.logPrefix.toLowerCase()} error message`,
  });
}

async function runBranchGeneration(
  options: BranchGenerationOptions,
  request: BranchRequest,
) {
  const context = createBranchContext(options, request);
  if (!context) return;
  const generation = options.generation.beginActiveGeneration();
  const startTime = Date.now();
  try {
    const prepared = await options.processPrompt({
      session: context.session,
      text: context.userMessage.content,
      attachments: context.userMessage.attachments ?? [],
    });
    options.commitMemory({
      sessionId: context.sessionId,
      session: context.session,
      ids: prepared.injectedMemoryIds,
    });
    const completed = await streamBranch(options, {
      context,
      prepared,
      generation,
    });
    if (completed) await completeBranch(options, { context, startTime });
  } catch (error) {
    await handleBranchFailure(options, {
      context,
      generation,
      startTime,
      logPrefix: request.logPrefix,
      error,
    });
  } finally {
    options.generation.finishActiveGeneration(generation);
  }
}

export function useBranchGeneration(options: BranchGenerationOptions) {
  const t = useTranslations("ChatApp");
  const generateBranch = useCallback(
    (request: BranchRequest) => runBranchGeneration(options, request),
    [options],
  );
  const handleRegenerate = useCallback(
    (messageId: string) =>
      generateBranch({
        messageId,
        errorMessage: t("errRegenerate"),
        logPrefix: "Regeneration",
      }),
    [generateBranch, t],
  );
  return { generateBranch, handleRegenerate };
}
