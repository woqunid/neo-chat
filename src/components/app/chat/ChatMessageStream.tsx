"use client";

import React from "react";

import FollowUpQuestions from "@/components/chat/FollowUpQuestions";
import MessageItem from "@/components/chat/MessageItem";
import { getMessageBranchInfo } from "@/lib/chat/messageTree";
import type { Message } from "@/types";

import type { ConversationModel } from "./types";

interface ChatMessageStreamProps {
  conversation: ConversationModel;
}

interface MessageRowProps extends ChatMessageStreamProps {
  message: Message;
  index: number;
}

function MessageFollowUp({ conversation, message, index }: MessageRowProps) {
  if (message.role !== "model") return null;
  if (index !== conversation.messages.length - 1) return null;
  if (conversation.isGenerating) return null;
  if (!message.suggestedQuestions?.length) return null;
  return (
    <FollowUpQuestions
      questions={message.suggestedQuestions}
      onClick={conversation.messageActions.onSuggestionClick}
    />
  );
}

function MessageRow({ conversation, message, index }: MessageRowProps) {
  const actions = conversation.messageActions;
  const isLast = index === conversation.messages.length - 1;
  const isLastUser =
    message.role === "user" && message.id === conversation.lastUserMessageId;
  return (
    <React.Fragment key={message.id}>
      <div className="[content-visibility:auto] [contain-intrinsic-size:0_240px]">
        <MessageItem
          message={message}
          branchInfo={getMessageBranchInfo(
            conversation.messageTree,
            message.id,
          )}
          onEdit={actions.onEdit}
          onDelete={actions.onDelete}
          canEditUserMessage={message.role === "user" && !isLastUser}
          onSubmitUserEdit={actions.onSubmitUserEdit}
          onRetract={isLastUser ? () => actions.onRetract(message) : undefined}
          isLast={isLast}
          isTyping={conversation.isGenerating && isLast}
          onRegenerate={() => actions.onRegenerate(message.id)}
          onVersionChange={actions.onVersionChange}
        />
      </div>
      <MessageFollowUp
        conversation={conversation}
        message={message}
        index={index}
      />
    </React.Fragment>
  );
}

export default function ChatMessageStream({
  conversation,
}: ChatMessageStreamProps) {
  if (conversation.welcomeState !== "hidden") return null;
  return (
    <div className="space-y-1 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500 fill-mode-forwards">
      {conversation.messages.map((message, index) => (
        <MessageRow
          key={message.id}
          conversation={conversation}
          message={message}
          index={index}
        />
      ))}
    </div>
  );
}
