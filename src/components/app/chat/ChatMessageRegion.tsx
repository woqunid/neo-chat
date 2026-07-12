"use client";

import AssistantHeader from "@/components/assistant/AssistantHeader";
import { useTranslations } from "next-intl";

import ChatMessageStream from "./ChatMessageStream";
import type { ChatRenderProps, ConversationModel } from "./types";

interface ChatMessageRegionProps {
  conversation: ConversationModel;
  messagesScrollRef: ChatRenderProps["messagesScrollRef"];
  handleMessagesScroll: ChatRenderProps["handleMessagesScroll"];
  handleMessagesScrollEnd: ChatRenderProps["handleMessagesScrollEnd"];
  handleMessagesWheel: ChatRenderProps["handleMessagesWheel"];
  handleMessagesTouchStart: ChatRenderProps["handleMessagesTouchStart"];
  handleMessagesTouchMove: ChatRenderProps["handleMessagesTouchMove"];
  handleMessagesTouchEnd: ChatRenderProps["handleMessagesTouchEnd"];
}

function SessionInstruction({
  conversation,
}: {
  conversation: ConversationModel;
}) {
  const session = conversation.currentSession;
  if (!session) return null;
  if (conversation.messages.length === 0 && !session.systemInstruction) {
    return null;
  }
  return (
    <AssistantHeader
      instruction={session.systemInstruction || ""}
      onUpdate={(instruction) =>
        conversation.onUpdateInstruction(session.id, instruction)
      }
      onDelete={
        session.systemInstruction
          ? () => conversation.onUpdateInstruction(session.id, "")
          : undefined
      }
    />
  );
}

export default function ChatMessageRegion({
  conversation,
  messagesScrollRef,
  handleMessagesScroll,
  handleMessagesScrollEnd,
  handleMessagesWheel,
  handleMessagesTouchStart,
  handleMessagesTouchMove,
  handleMessagesTouchEnd,
}: ChatMessageRegionProps) {
  const t = useTranslations("ChatApp");
  return (
    <div
      ref={messagesScrollRef}
      onScroll={handleMessagesScroll}
      onScrollEnd={handleMessagesScrollEnd}
      onWheel={handleMessagesWheel}
      onTouchStart={handleMessagesTouchStart}
      onTouchMove={handleMessagesTouchMove}
      onTouchEnd={handleMessagesTouchEnd}
      onTouchCancel={handleMessagesTouchEnd}
      className="flex-1 px-4 md:px-8 pt-4 md:pt-6 pb-[calc(8rem+env(safe-area-inset-bottom))] relative scrollbar-overlay"
    >
      <div className="w-full max-w-3xl mx-auto min-h-full flex flex-col">
        <SessionInstruction conversation={conversation} />
        {conversation.loadError ? (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
          >
            {t("errLoadChat")}
          </div>
        ) : null}
        {conversation.welcomeState !== "hidden" && (
          <div
            className={`emptyChatSurface flex-1 motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:transform origin-center ${
              conversation.welcomeState === "exiting"
                ? "opacity-0 scale-95 pointer-events-none"
                : "opacity-100 scale-100"
            }`}
          />
        )}
        <ChatMessageStream conversation={conversation} />
      </div>
    </div>
  );
}
