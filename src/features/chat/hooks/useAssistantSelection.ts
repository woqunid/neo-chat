"use client";

import { useCallback, useEffect, useRef } from "react";
import { useLocale } from "next-intl";

import { logDevError } from "@/lib/utils/devLogger";
import { getAgentDetail } from "@/services/api/agentService";
import type { LobeAgent } from "@/types";

import type { ChatShellState } from "../runtimeTypes";
import type { useChatPanelNavigation } from "./useChatPanelNavigation";

interface AssistantSelectionOptions {
  shell: ChatShellState;
  navigation: ReturnType<typeof useChatPanelNavigation>;
  isGenerating: boolean;
  stopWithFeedback: () => Promise<void>;
}

async function resolveInstruction(agent: LobeAgent, locale: string) {
  if (agent.meta.systemRole) return agent.meta.systemRole;
  if (!agent.isCustom) {
    try {
      const detail = await getAgentDetail(agent.identifier, locale);
      if (detail.config?.systemRole) return detail.config.systemRole;
    } catch (error) {
      logDevError("Failed to fetch agent details for instruction", error);
    }
  }
  return `You are ${agent.meta.title}. ${agent.meta.description}`;
}

function applyAssistant(
  options: AssistantSelectionOptions,
  request: { agent: LobeAgent; instruction: string },
) {
  const sessionId = options.shell.chat.currentSessionId;
  const session = options.shell.chat.getCurrentSession();
  if (
    sessionId &&
    session?.messageCount === 0 &&
    session.title === "New Chat"
  ) {
    options.shell.chat.updateSessionInstruction(sessionId, request.instruction);
    options.shell.chat.updateSessionTitle(sessionId, request.agent.meta.title);
    return;
  }
  options.shell.chat.createSession(
    request.instruction,
    request.agent.meta.title,
  );
}

export function useAssistantSelection(options: AssistantSelectionOptions) {
  const locale = useLocale();
  const requestRef = useRef(0);

  useEffect(
    () => () => {
      requestRef.current += 1;
    },
    [],
  );

  return useCallback(
    async (agent: LobeAgent) => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      if (options.isGenerating) void options.stopWithFeedback();
      if (options.navigation.viewMode === "assistants") {
        options.navigation.navigateToPanel({ panel: "chat" });
      }
      const instruction = await resolveInstruction(agent, locale);
      if (requestId !== requestRef.current) return;
      applyAssistant(options, { agent, instruction });
    },
    [locale, options],
  );
}
