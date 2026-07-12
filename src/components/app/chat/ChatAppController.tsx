"use client";

import { createChatAppViewModel } from "@/features/chat/chatAppViewModel";
import { useChatControllerBase } from "@/features/chat/hooks/useChatControllerBase";
import { useChatGenerationActions } from "@/features/chat/hooks/useChatGenerationActions";
import { useChatInteractionActions } from "@/features/chat/hooks/useChatInteractionActions";

import ChatAppShell from "./ChatAppShell";

export default function ChatAppController() {
  const base = useChatControllerBase();
  const workflows = useChatGenerationActions(base);
  const actions = useChatInteractionActions(base, workflows);
  const model = createChatAppViewModel(base, workflows, actions);
  const scroll = base.autoScroll;
  return (
    <ChatAppShell
      model={model}
      inputRef={base.messageInputRef}
      messagesScrollRef={scroll.messagesScrollRef}
      handleMessagesScroll={scroll.handleScroll}
      handleMessagesScrollEnd={scroll.handleScrollEnd}
      handleMessagesWheel={scroll.handleWheel}
      handleMessagesTouchStart={scroll.handleTouchStart}
      handleMessagesTouchMove={scroll.handleTouchMove}
      handleMessagesTouchEnd={scroll.handleTouchEnd}
    />
  );
}
