"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { createStoppedGenerationUpdate } from "@/lib/chat/messageGenerationStatus";
import { logDevError } from "@/lib/utils/devLogger";
import { useChatStore } from "@/store/core/chatStore";
import type { Message } from "@/types";

import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";

const loadChatService = () => import("@/services/api/chatService");

interface GenerationPersistenceOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  showActionError: (message: string) => void;
}

function useSyncWithNotice(options: GenerationPersistenceOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(
    async (request: { sessionId: string; logMessage: string }) => {
      try {
        await options.shell.chat.syncActiveSession(request.sessionId);
      } catch (error) {
        logDevError(request.logMessage, error);
        options.showActionError(t("errSaveChanges"));
      }
    },
    [options, t],
  );
}

function useMarkAborted(
  options: GenerationPersistenceOptions,
  syncWithNotice: ReturnType<typeof useSyncWithNotice>,
) {
  return useCallback(
    async (request: {
      sessionId: string;
      messageId: string;
      logMessage: string;
    }) => {
      const message = useChatStore
        .getState()
        .activeMessages.find((item) => item.id === request.messageId);
      if (!message) return;
      options.shell.chat.updateMessage(
        request.sessionId,
        request.messageId,
        createStoppedGenerationUpdate(message, Date.now()),
      );
      await syncWithNotice(request);
    },
    [options.shell.chat, syncWithNotice],
  );
}

function useStopWithFeedback(options: GenerationPersistenceOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(async () => {
    try {
      await options.generation.stopActiveGeneration();
    } catch (error) {
      logDevError("Failed to persist stopped generation", error);
      options.showActionError(t("errSaveStopped"));
    }
  }, [options, t]);
}

function useQueueMemoryExtraction() {
  return useCallback(
    (request: {
      sessionId: string;
      user: Pick<Message, "id" | "content">;
      assistant: Pick<Message, "id" | "content">;
    }) => {
      loadChatService()
        .then(({ performBackgroundMemoryExtraction }) =>
          performBackgroundMemoryExtraction({
            sessionId: request.sessionId,
            userMessage: request.user,
            assistantMessage: request.assistant,
          }),
        )
        .catch((error) => logDevError("Memory extraction failed:", error));
    },
    [],
  );
}

export function useGenerationPersistence(
  options: GenerationPersistenceOptions,
) {
  const syncWithNotice = useSyncWithNotice(options);
  const markAborted = useMarkAborted(options, syncWithNotice);
  const stopWithFeedback = useStopWithFeedback(options);
  const queueMemoryExtraction = useQueueMemoryExtraction();
  return {
    syncWithNotice,
    markAborted,
    stopWithFeedback,
    queueMemoryExtraction,
  };
}
