import type {
  ChatAppViewModel,
  ComposerModel,
  ConversationModel,
  SidebarModel,
} from "@/components/app/chat/types";

import type { ChatControllerBase } from "./hooks/useChatControllerBase";
import type { ChatGenerationActions } from "./hooks/useChatGenerationActions";
import type { ChatInteractionActions } from "./hooks/useChatInteractionActions";

function buildComposer(
  base: ChatControllerBase,
  workflows: ChatGenerationActions,
  actions: ChatInteractionActions,
): ComposerModel {
  return {
    variant: base.welcome.messageInputVariant,
    welcomeState: base.welcome.welcomeState,
    availableModels: base.availableModels,
    selectedModel: base.shell.chat.selectedModel,
    isGenerating: base.generation.isGenerating,
    disabled: base.shell.chat.isActiveSessionLoading,
    queuedMessageCount: workflows.queuedMessageCount,
    isSearchEnabled: base.shell.chat.chatConfig.useSearch,
    onSend: workflows.handleSendMessage,
    onStop: actions.handleStopGeneration,
    onSelectModel: base.shell.chat.setModel,
    onSearchEnabledChange: actions.onSearchEnabledChange,
  };
}

function buildConversation(
  base: ChatControllerBase,
  workflows: ChatGenerationActions,
  actions: ChatInteractionActions,
): ConversationModel {
  return {
    currentSession: base.currentSession,
    messages: base.messages,
    messageTree: base.shell.chat.activeMessageTree,
    isGenerating: base.generation.isGenerating,
    actionsDisabled: base.shell.chat.isActiveSessionLoading,
    loadError: base.shell.chat.activeSessionLoadError,
    lastUserMessageId: base.lastUserMessageId,
    welcomeState: base.welcome.welcomeState,
    shouldShowTitle: base.welcome.shouldShowChatTitleBar,
    onUpdateInstruction: base.shell.chat.updateSessionInstruction,
    messageActions: {
      onEdit: actions.onEdit,
      onDelete: actions.onDelete,
      onSubmitUserEdit: actions.onSubmitUserEdit,
      onRetract: actions.onRetract,
      onRegenerate: actions.onRegenerate,
      onVersionChange: actions.onVersionChange,
      onSuggestionClick: actions.onSuggestionClick,
    },
    composer: buildComposer(base, workflows, actions),
  };
}

function buildSidebar(
  base: ChatControllerBase,
  actions: ChatInteractionActions,
): SidebarModel {
  return {
    sessions: base.shell.chat.sessions,
    currentSessionId: base.shell.chat.currentSessionId,
    isGenerating: base.generation.isGenerating,
    isSessionLoading: base.shell.chat.isActiveSessionLoading,
    onSelectSession: actions.handleSelectSession,
    onNewChat: actions.handleNewChat,
    onDeleteSession: actions.handleDeleteSession,
    onRenameSession: base.shell.chat.updateSessionTitle,
    onTogglePin: base.shell.chat.toggleSessionPin,
    onDuplicate: actions.handleDuplicateSession,
    onSmartRename: actions.handleSmartRename,
  };
}

export function createChatAppViewModel(
  base: ChatControllerBase,
  workflows: ChatGenerationActions,
  actions: ChatInteractionActions,
): ChatAppViewModel {
  return {
    actionError: base.notice.actionError,
    navigation: base.navigation,
    sidebar: buildSidebar(base, actions),
    panels: { onAssistantSelect: actions.onAssistantSelect },
    conversation: buildConversation(base, workflows, actions),
  };
}
