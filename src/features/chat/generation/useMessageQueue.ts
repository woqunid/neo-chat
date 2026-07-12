"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useChatStore } from "@/store/core/chatStore";
import type { Attachment } from "@/types";

import type { ChatShellState } from "../runtimeTypes";

export interface QueuedChatMessage {
  sessionId: string;
  text: string;
  attachments: Attachment[];
}

export type SendMessageNow = (
  text: string,
  attachments: Attachment[],
  sessionId?: string,
) => Promise<void>;

interface MessageQueueOptions {
  shell: ChatShellState;
  isGenerating: boolean;
  isGeneratingRef: React.MutableRefObject<boolean>;
  sendMessageNow: SendMessageNow;
}

function getTargetSessionId(shell: ChatShellState): string | null {
  const current = useChatStore.getState().currentSessionId;
  return current || shell.chat.createSession() || null;
}

export function useMessageQueue(options: MessageQueueOptions) {
  const [queuedMessageCount, setQueuedMessageCount] = useState(0);
  const queuedMessagesRef = useRef<QueuedChatMessage[]>([]);
  const sendMessageNowRef = useRef<SendMessageNow | null>(null);

  useEffect(() => {
    sendMessageNowRef.current = options.sendMessageNow;
  }, [options.sendMessageNow]);

  const enqueueChatMessage = useCallback((message: QueuedChatMessage) => {
    queuedMessagesRef.current = [...queuedMessagesRef.current, message];
    setQueuedMessageCount(queuedMessagesRef.current.length);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string, attachments: Attachment[]) => {
      if (!text.trim() && attachments.length === 0) return;
      const sessionId = getTargetSessionId(options.shell);
      if (!sessionId) return;
      if (options.isGeneratingRef.current) {
        enqueueChatMessage({ sessionId, text, attachments });
        return;
      }
      await options.sendMessageNow(text, attachments, sessionId);
    },
    [enqueueChatMessage, options],
  );

  useEffect(() => {
    if (options.isGenerating || queuedMessageCount === 0) return;
    const next = queuedMessagesRef.current[0];
    const activeSessionId = useChatStore.getState().currentSessionId;
    if (!next || next.sessionId !== activeSessionId) return;
    queuedMessagesRef.current = queuedMessagesRef.current.slice(1);
    setQueuedMessageCount(queuedMessagesRef.current.length);
    void sendMessageNowRef.current?.(
      next.text,
      next.attachments,
      next.sessionId,
    );
  }, [
    options.isGenerating,
    options.shell.chat.currentSessionId,
    queuedMessageCount,
  ]);

  return { queuedMessageCount, enqueueChatMessage, handleSendMessage };
}
