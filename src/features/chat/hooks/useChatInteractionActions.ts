"use client";

import { useCallback } from "react";

import { useAssistantSelection } from "./useAssistantSelection";
import type { ChatControllerBase } from "./useChatControllerBase";
import type { ChatGenerationActions } from "./useChatGenerationActions";
import { useChatMessageActions } from "./useChatMessageActions";
import { useChatSessionActions } from "./useChatSessionActions";

export function useChatInteractionActions(
  base: ChatControllerBase,
  workflows: ChatGenerationActions,
) {
  const session = useChatSessionActions({
    shell: base.shell,
    generation: base.generation,
    navigation: base.navigation,
    isGenerating: base.generation.isGenerating,
    stopWithFeedback: workflows.stopWithFeedback,
    showActionError: base.notice.showActionError,
  });
  const onAssistantSelect = useAssistantSelection({
    shell: base.shell,
    navigation: base.navigation,
    isGenerating: base.generation.isGenerating,
    stopWithFeedback: workflows.stopWithFeedback,
  });
  const message = useChatMessageActions({
    shell: base.shell,
    inputRef: base.messageInputRef,
    showActionError: base.notice.showActionError,
    syncWithNotice: workflows.syncWithNotice,
    handleRegenerate: workflows.handleRegenerate,
    handleSubmitUserEdit: workflows.handleSubmitUserEdit,
    handleSendMessage: workflows.handleSendMessage,
  });
  const onSearchEnabledChange = useCallback(
    (enabled: boolean) => {
      base.shell.chat.setChatConfig({ useSearch: enabled });
      const sessionId = base.shell.chat.currentSessionId;
      if (sessionId) {
        base.shell.chat.updateSessionConfig(sessionId, { useSearch: enabled });
      }
    },
    [base.shell.chat],
  );
  const stopWithFeedback = workflows.stopWithFeedback;
  const handleStopGeneration = useCallback(
    () => void stopWithFeedback(),
    [stopWithFeedback],
  );
  return {
    ...session,
    ...message,
    onAssistantSelect,
    onSearchEnabledChange,
    handleStopGeneration,
  };
}

export type ChatInteractionActions = ReturnType<
  typeof useChatInteractionActions
>;
