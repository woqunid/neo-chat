"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import ChatMain from "./ChatMain";
import ChatSidebar from "./ChatSidebar";
import type { ChatAppViewModel, ChatRenderProps } from "./types";

const ImagePreview = dynamic(() => import("@/components/media/ImagePreview"), {
  ssr: false,
});

interface ChatAppShellProps extends ChatRenderProps {
  model: ChatAppViewModel;
}

export default function ChatAppShell({
  model,
  inputRef,
  messagesScrollRef,
  handleMessagesScroll,
  handleMessagesScrollEnd,
  handleMessagesWheel,
  handleMessagesTouchStart,
  handleMessagesTouchMove,
  handleMessagesTouchEnd,
}: ChatAppShellProps) {
  const t = useTranslations("ChatApp");
  const navigation = model.navigation;

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-background font-sans text-foreground transition-colors duration-300">
      <a className="skip-link" href="#main-chat">
        {t("skipToChat")}
      </a>
      <ImagePreview />
      {navigation.isSidebarDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/10 transition-opacity duration-200 dark:bg-black/50 lg:hidden"
          onClick={() => navigation.setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <ChatSidebar model={model} />
      <ChatMain
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
    </div>
  );
}
