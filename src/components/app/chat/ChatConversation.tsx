"use client";

import ChatComposer from "./ChatComposer";
import ChatHeader from "./ChatHeader";
import ChatMessageRegion from "./ChatMessageRegion";
import type { ChatAppViewModel, ChatRenderProps } from "./types";

interface ChatConversationProps extends ChatRenderProps {
  model: ChatAppViewModel;
}

export default function ChatConversation({
  model,
  inputRef,
  messagesScrollRef,
  handleMessagesScroll,
  handleMessagesScrollEnd,
  handleMessagesWheel,
  handleMessagesTouchStart,
  handleMessagesTouchMove,
  handleMessagesTouchEnd,
}: ChatConversationProps) {
  return (
    <>
      <ChatHeader model={model} />
      <ChatMessageRegion
        conversation={model.conversation}
        messagesScrollRef={messagesScrollRef}
        handleMessagesScroll={handleMessagesScroll}
        handleMessagesScrollEnd={handleMessagesScrollEnd}
        handleMessagesWheel={handleMessagesWheel}
        handleMessagesTouchStart={handleMessagesTouchStart}
        handleMessagesTouchMove={handleMessagesTouchMove}
        handleMessagesTouchEnd={handleMessagesTouchEnd}
      />
      <div className="w-full h-4 md:h-6" />
      <ChatComposer
        composer={model.conversation.composer}
        inputRef={inputRef}
      />
    </>
  );
}
