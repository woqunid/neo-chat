"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import type { MessageInputRef } from "@/components/chat/MessageInput";
import { logDevError } from "@/lib/utils/devLogger";
import type { Attachment, Message } from "@/types";

import type { ChatShellState } from "../runtimeTypes";

interface MessageActionsOptions {
  shell: ChatShellState;
  inputRef: React.RefObject<MessageInputRef | null>;
  showActionError: (message: string) => void;
  syncWithNotice: (request: {
    sessionId: string;
    logMessage: string;
  }) => Promise<void>;
  handleRegenerate: (messageId: string) => void | Promise<void>;
  handleSubmitUserEdit: (
    messageId: string,
    content: string,
  ) => void | Promise<void>;
  handleSendMessage: (
    text: string,
    attachments: Attachment[],
  ) => void | Promise<void>;
}

function useEditDeleteActions(options: MessageActionsOptions) {
  const t = useTranslations("ChatApp");
  const onEdit = useCallback(
    (messageId: string, content: string) => {
      const sessionId = options.shell.chat.currentSessionId;
      if (!sessionId) return;
      options.shell.chat.updateMessageContent(sessionId, messageId, content);
      void options.syncWithNotice({
        sessionId,
        logMessage: "Failed to persist edited message",
      });
    },
    [options],
  );
  const onDelete = useCallback(
    async (messageId: string) => {
      const sessionId = options.shell.chat.currentSessionId;
      if (!sessionId) return;
      try {
        await options.shell.chat.deleteMessage(sessionId, messageId);
      } catch (error) {
        logDevError("Failed to delete message", error);
        options.showActionError(t("errDeleteMessage"));
      }
    },
    [options, t],
  );
  return { onEdit, onDelete };
}

function useRetractVersionActions(options: MessageActionsOptions) {
  const t = useTranslations("ChatApp");
  const onRetract = useCallback(
    async (message: Message) => {
      const sessionId = options.shell.chat.currentSessionId;
      if (!sessionId) return;
      try {
        await options.shell.chat.deleteMessageAndSubsequent(
          sessionId,
          message.id,
        );
        options.inputRef.current?.setValue(message.content);
        options.inputRef.current?.focus();
      } catch (error) {
        logDevError("Failed to retract message", error);
        options.showActionError(t("errRetractMessage"));
      }
    },
    [options, t],
  );
  const onVersionChange = useCallback(
    (messageId: string, direction: "prev" | "next") => {
      const sessionId = options.shell.chat.currentSessionId;
      if (sessionId) {
        options.shell.chat.switchMessageVersion(
          sessionId,
          messageId,
          direction,
        );
      }
    },
    [options.shell.chat],
  );
  return { onRetract, onVersionChange };
}

export function useChatMessageActions(options: MessageActionsOptions) {
  const editDelete = useEditDeleteActions(options);
  const retractVersion = useRetractVersionActions(options);
  const onSuggestionClick = useCallback(
    (question: string) => void options.handleSendMessage(question, []),
    [options],
  );
  return {
    ...editDelete,
    ...retractVersion,
    onRegenerate: options.handleRegenerate,
    onSubmitUserEdit: options.handleSubmitUserEdit,
    onSuggestionClick,
  };
}
