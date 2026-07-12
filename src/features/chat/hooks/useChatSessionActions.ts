"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { shouldAbortActiveGenerationForSessionDelete } from "@/lib/chat/postGenerationGuards";
import {
  createSessionPostGenerationSnapshot,
  shouldApplyRequestedTitle,
} from "@/lib/chat/postGenerationGuards";
import {
  getActiveMessagePath,
  normalizeSessionMessageTree,
} from "@/lib/chat/messageTree";
import { logDevError } from "@/lib/utils/devLogger";
import { useChatStore } from "@/store/core/chatStore";
import { appDb } from "@/store/storage/storageConfig";
import type { Message, SessionMessageTree } from "@/types";

import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import type { useChatPanelNavigation } from "./useChatPanelNavigation";

const loadChatService = () => import("@/services/api/chatService");

interface SessionActionsOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  navigation: ReturnType<typeof useChatPanelNavigation>;
  isGenerating: boolean;
  stopWithFeedback: () => Promise<void>;
  showActionError: (message: string) => void;
}

async function loadSessionMessages(sessionId: string): Promise<Message[]> {
  const state = useChatStore.getState();
  if (state.currentSessionId === sessionId) return state.activeMessages;
  const stored = await appDb.getItem<Message[] | SessionMessageTree>(
    `session_messages_${sessionId}`,
  );
  return getActiveMessagePath(normalizeSessionMessageTree(stored));
}

function useDeleteSession(options: SessionActionsOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(
    async (sessionId: string) => {
      try {
        const shouldStop = shouldAbortActiveGenerationForSessionDelete({
          currentSessionId: options.shell.chat.currentSessionId,
          deletingSessionId: sessionId,
          isGenerating: options.isGenerating,
        });
        if (shouldStop) await options.generation.stopActiveGeneration();
        await options.shell.chat.deleteSession(sessionId);
      } catch (error) {
        logDevError("Failed to delete session", error);
        options.showActionError(t("errDeleteChat"));
      }
    },
    [options, t],
  );
}

function useDuplicateSession(options: SessionActionsOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(
    async (sessionId: string) => {
      try {
        await options.shell.chat.duplicateSession(sessionId);
      } catch (error) {
        logDevError("Failed to duplicate session", error);
        options.showActionError(t("errDuplicateChat"));
      }
    },
    [options, t],
  );
}

function useSmartRename(options: SessionActionsOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(
    async (sessionId: string) => {
      const session = useChatStore
        .getState()
        .sessions.find((item) => item.id === sessionId);
      const snapshot = createSessionPostGenerationSnapshot(session);
      if (!snapshot) return;
      let messages: Message[];
      try {
        messages = await loadSessionMessages(sessionId);
      } catch (error) {
        logDevError("Failed to load messages for smart rename", error);
        options.showActionError(t("errRenameChat"));
        return;
      }
      if (messages.length === 0) return;
      const { generateChatTitle } = await loadChatService();
      const title = await generateChatTitle(messages);
      const current = useChatStore
        .getState()
        .sessions.find((item) => item.id === sessionId);
      if (shouldApplyRequestedTitle(current, snapshot)) {
        options.shell.chat.updateSessionTitle(sessionId, title);
      }
    },
    [options, t],
  );
}

export function useChatSessionActions(options: SessionActionsOptions) {
  const handleDeleteSession = useDeleteSession(options);
  const handleDuplicateSession = useDuplicateSession(options);
  const handleSmartRename = useSmartRename(options);
  const handleNewChat = useCallback(() => {
    if (options.isGenerating) void options.stopWithFeedback();
    options.shell.chat.createSession();
    options.navigation.navigateToPanel({ panel: "chat" });
  }, [options]);
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (options.isGenerating) void options.stopWithFeedback();
      options.shell.chat.selectSession(sessionId);
      options.navigation.navigateToPanel({ panel: "chat" });
    },
    [options],
  );
  return {
    handleDeleteSession,
    handleDuplicateSession,
    handleSmartRename,
    handleNewChat,
    handleSelectSession,
  };
}
