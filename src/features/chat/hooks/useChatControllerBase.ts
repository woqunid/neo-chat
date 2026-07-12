"use client";

import { useEffect, useMemo, useRef } from "react";

import type { MessageInputRef } from "@/components/chat/MessageInput";
import {
  useChatGenerationController,
  useChatModelBootstrap,
  useChatPanelNavigation,
  useChatShellState,
  useChatStartupEffects,
  useChatThemeEffects,
  useMessageAutoScroll,
  useWelcomeChatState,
  useWorkspaceAttachmentHydration,
} from "@/features/chat";
import type { Message } from "@/types";

import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import { useChatActionError } from "./useChatActionError";

const EMPTY_MESSAGES: Message[] = [];

function findLastUserMessageId(messages: Message[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].id;
  }
  return undefined;
}

function useConversationBase(
  shell: ChatShellState,
  generation: ChatGenerationController,
) {
  const currentSession = shell.chat.getCurrentSession();
  const messages = shell.chat.activeMessages ?? EMPTY_MESSAGES;
  const welcome = useWelcomeChatState({
    currentSessionId: shell.chat.currentSessionId,
    isChatEmpty: messages.length === 0 && !currentSession?.systemInstruction,
  });
  const autoScroll = useMessageAutoScroll({
    enabled:
      welcome.welcomeState === "hidden" &&
      (generation.isGenerating || messages.length > 0),
    updateKey: messages,
  });
  const lastUserMessageId = useMemo(
    () => findLastUserMessageId(messages),
    [messages],
  );
  return {
    currentSession,
    messages,
    welcome,
    autoScroll,
    lastUserMessageId,
  };
}

export function useChatControllerBase() {
  const shell = useChatShellState();
  const navigation = useChatPanelNavigation();
  const generation = useChatGenerationController();
  const notice = useChatActionError();
  const availableModels = useChatModelBootstrap(shell);
  const messageInputRef = useRef<MessageInputRef>(null);
  const isGeneratingRef = useRef(generation.isGenerating);
  const conversation = useConversationBase(shell, generation);

  useEffect(() => {
    isGeneratingRef.current = generation.isGenerating;
  }, [generation.isGenerating]);
  useChatThemeEffects(shell.core.theme, shell.settings.system.fontSize);
  useChatStartupEffects(shell);
  useWorkspaceAttachmentHydration({
    activeMessagesLength: conversation.messages.length,
    currentSessionId: shell.chat.currentSessionId,
    currentWorkspaceId: conversation.currentSession?.workspaceId,
    inputRef: messageInputRef,
    workspaces: shell.chat.workspaces,
  });

  return {
    shell,
    navigation,
    generation,
    notice,
    availableModels,
    messageInputRef,
    isGeneratingRef,
    ...conversation,
  };
}

export type ChatControllerBase = ReturnType<typeof useChatControllerBase>;
