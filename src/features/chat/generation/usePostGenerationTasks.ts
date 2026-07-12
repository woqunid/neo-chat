"use client";

import { useCallback } from "react";

import {
  createSessionPostGenerationSnapshot,
  shouldApplyCompressionUpdate,
  shouldApplyGeneratedTitle,
  shouldApplySuggestedQuestions,
} from "@/lib/chat/postGenerationGuards";
import { logDevError } from "@/lib/utils/devLogger";
import { useChatStore } from "@/store/core/chatStore";
import type { Message, Session } from "@/types";

import type { ChatShellState } from "../runtimeTypes";

const loadChatService = () => import("@/services/api/chatService");

interface PostGenerationRequest {
  sessionId: string;
  modelMessageId: string;
  userMessage: Pick<Message, "id" | "content">;
  shouldAutoRename: boolean;
}

interface PostGenerationContext {
  request: PostGenerationRequest;
  session?: Session;
  messages: Message[];
  message?: Message;
  snapshot: ReturnType<typeof createSessionPostGenerationSnapshot>;
}

interface PostGenerationOptions {
  shell: ChatShellState;
  queueMemoryExtraction: (request: {
    sessionId: string;
    user: Pick<Message, "id" | "content">;
    assistant: Pick<Message, "id" | "content">;
  }) => void;
}

function buildContext(request: PostGenerationRequest): PostGenerationContext {
  const state = useChatStore.getState();
  const session = state.sessions.find((item) => item.id === request.sessionId);
  const messages =
    state.currentSessionId === request.sessionId ? state.activeMessages : [];
  return {
    request,
    session,
    messages,
    message: messages.find((item) => item.id === request.modelMessageId),
    snapshot: createSessionPostGenerationSnapshot(session),
  };
}

function queueMemory(
  options: PostGenerationOptions,
  context: PostGenerationContext,
) {
  if (!context.message) return;
  options.queueMemoryExtraction({
    sessionId: context.request.sessionId,
    user: context.request.userMessage,
    assistant: {
      id: context.message.id,
      content: context.message.content,
    },
  });
}

function startSuggestedQuestions(
  options: PostGenerationOptions,
  context: PostGenerationContext,
) {
  if (!options.shell.settings.system.enableRelatedQuestions) return;
  if (context.messages.length === 0 || !context.message) return;
  const messageSnapshot = {
    id: context.message.id,
    content: context.message.content,
  };
  loadChatService()
    .then(({ generateRelatedQuestions }) =>
      generateRelatedQuestions(context.messages),
    )
    .then((questions) => {
      const state = useChatStore.getState();
      const current =
        state.currentSessionId === context.request.sessionId
          ? state.activeMessages.find(
              (item) => item.id === context.request.modelMessageId,
            )
          : undefined;
      if (!questions.length) return;
      if (!shouldApplySuggestedQuestions(current, messageSnapshot)) return;
      options.shell.chat.setSuggestedQuestions(
        context.request.sessionId,
        context.request.modelMessageId,
        questions,
      );
    })
    .catch((error) =>
      logDevError("Related question generation failed:", error),
    );
}

function startAutoTitle(
  options: PostGenerationOptions,
  context: PostGenerationContext,
) {
  if (!context.request.shouldAutoRename || context.messages.length === 0)
    return;
  loadChatService()
    .then(({ generateChatTitle }) => generateChatTitle(context.messages))
    .then((title) => {
      const current = useChatStore
        .getState()
        .sessions.find((item) => item.id === context.request.sessionId);
      if (!title || !shouldApplyGeneratedTitle(current, context.snapshot))
        return;
      options.shell.chat.updateSessionTitle(context.request.sessionId, title);
    })
    .catch((error) => logDevError("Chat title generation failed:", error));
}

function startCompression(
  options: PostGenerationOptions,
  context: PostGenerationContext,
) {
  if (!options.shell.settings.system.enableAutoCompression) return;
  if (!context.session || context.messages.length === 0) return;
  loadChatService()
    .then(({ performBackgroundCompression }) =>
      performBackgroundCompression(
        context.messages,
        context.session?.compression,
        options.shell.chat.selectedModel,
      ),
    )
    .then((compression) => {
      const current = useChatStore
        .getState()
        .sessions.find((item) => item.id === context.request.sessionId);
      if (
        !compression ||
        !shouldApplyCompressionUpdate(current, context.snapshot)
      )
        return;
      options.shell.chat.updateSessionCompression(
        context.request.sessionId,
        compression,
      );
    })
    .catch((error) => logDevError("Context compression failed:", error));
}

export function usePostGenerationTasks(options: PostGenerationOptions) {
  return useCallback(
    (request: PostGenerationRequest) => {
      const context = buildContext(request);
      queueMemory(options, context);
      startSuggestedQuestions(options, context);
      startAutoTitle(options, context);
      startCompression(options, context);
    },
    [options],
  );
}
