import type { RefObject } from "react";
import type { MessageInputRef } from "@/components/chat/MessageInput";
import type { ModelInfo } from "@/services/api/chatService";
import type {
  Attachment,
  LobeAgent,
  Message,
  Session,
  SessionMessageTree,
} from "@/types";
import type {
  useChatPanelNavigation,
  useMessageAutoScroll,
  WelcomeState,
} from "@/features/chat";

export type PanelNavigation = ReturnType<typeof useChatPanelNavigation>;
export type MessageAutoScroll = ReturnType<typeof useMessageAutoScroll>;

export interface ChatRenderProps {
  inputRef: RefObject<MessageInputRef | null>;
  messagesScrollRef: MessageAutoScroll["messagesScrollRef"];
  handleMessagesScroll: MessageAutoScroll["handleScroll"];
  handleMessagesScrollEnd: MessageAutoScroll["handleScrollEnd"];
  handleMessagesWheel: MessageAutoScroll["handleWheel"];
  handleMessagesTouchStart: MessageAutoScroll["handleTouchStart"];
  handleMessagesTouchMove: MessageAutoScroll["handleTouchMove"];
  handleMessagesTouchEnd: MessageAutoScroll["handleTouchEnd"];
}

export interface SidebarModel {
  sessions: Session[];
  currentSessionId: string | null;
  isGenerating: boolean;
  isSessionLoading: boolean;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void | Promise<void>;
  onRenameSession: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onDuplicate: (id: string) => void | Promise<void>;
  onSmartRename: (id: string) => void | Promise<void>;
}

export interface PanelModel {
  onAssistantSelect: (agent: LobeAgent) => void | Promise<void>;
}

export interface MessageActionsModel {
  onEdit: (id: string, content: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  onSubmitUserEdit: (id: string, content: string) => void | Promise<void>;
  onRetract: (message: Message) => void | Promise<void>;
  onRegenerate: (id: string) => void | Promise<void>;
  onVersionChange: (id: string, direction: "prev" | "next") => void;
  onSuggestionClick: (question: string) => void;
}

export interface ComposerModel {
  variant: "default" | "hero";
  welcomeState: WelcomeState;
  availableModels: ModelInfo[];
  selectedModel: string;
  isGenerating: boolean;
  disabled: boolean;
  queuedMessageCount: number;
  isSearchEnabled: boolean;
  onSend: (text: string, attachments: Attachment[]) => void | Promise<void>;
  onStop: () => void;
  onSelectModel: (model: string) => void;
  onSearchEnabledChange: (enabled: boolean) => void;
}

export interface ConversationModel {
  currentSession: Session | null | undefined;
  messages: Message[];
  messageTree: SessionMessageTree;
  isGenerating: boolean;
  actionsDisabled: boolean;
  loadError: "session_load_failed" | null;
  lastUserMessageId?: string;
  welcomeState: WelcomeState;
  shouldShowTitle: boolean;
  onUpdateInstruction: (sessionId: string, instruction: string) => void;
  messageActions: MessageActionsModel;
  composer: ComposerModel;
}

export interface ChatAppViewModel {
  actionError: string | null;
  navigation: PanelNavigation;
  sidebar: SidebarModel;
  panels: PanelModel;
  conversation: ConversationModel;
}
