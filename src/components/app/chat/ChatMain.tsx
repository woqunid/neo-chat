"use client";

import ChatPanelRouter from "./ChatPanelRouter";
import type { ChatAppViewModel, ChatRenderProps } from "./types";

interface ChatMainProps extends ChatRenderProps {
  model: ChatAppViewModel;
}

function ActionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="absolute top-16 left-4 right-4 z-30 pointer-events-none"
    >
      <div className="mx-auto max-w-3xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-100">
        {message}
      </div>
    </div>
  );
}

export default function ChatMain({
  model,
  inputRef,
  messagesScrollRef,
  handleMessagesScroll,
  handleMessagesScrollEnd,
  handleMessagesWheel,
  handleMessagesTouchStart,
  handleMessagesTouchMove,
  handleMessagesTouchEnd,
}: ChatMainProps) {
  return (
    <main
      {...model.navigation.mainInertProps}
      id="main-chat"
      tabIndex={-1}
      className="flex-1 flex flex-col h-full relative z-0 min-w-0 overflow-hidden md:pl-16 lg:pl-0"
    >
      {model.actionError && <ActionError message={model.actionError} />}
      <ChatPanelRouter
        model={model}
        inputRef={inputRef}
        messagesScrollRef={messagesScrollRef}
        handleMessagesScroll={handleMessagesScroll}
        handleMessagesScrollEnd={handleMessagesScrollEnd}
        handleMessagesWheel={handleMessagesWheel}
        handleMessagesTouchStart={handleMessagesTouchStart}
        handleMessagesTouchMove={handleMessagesTouchMove}
        handleMessagesTouchEnd={handleMessagesTouchEnd}
      />
    </main>
  );
}
