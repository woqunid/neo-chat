"use client";

import { useCallback } from "react";

import { resolveEffectiveChatContext } from "@/lib/chat/effectiveChatContext";
import { processMessageForSending } from "@/lib/chat/messageProcessor";
import { buildDirectMemoryPromptContext } from "@/lib/memory/entities";
import { getSuppressedMemoryIds } from "@/lib/memory/compression";
import { appendContextToChatInput } from "@/lib/utils/chatInput";
import { useMemoryStore } from "@/store/core/memoryStore";

import type { ChatShellState } from "../runtimeTypes";
import type { PreparedChatPrompt, PromptRequest } from "./shared";

interface PromptProcessorOptions {
  shell: ChatShellState;
}

function resolveWorkspace(
  options: PromptProcessorOptions,
  request: PromptRequest,
) {
  if (!request.session?.workspaceId) return null;
  return (
    options.shell.chat.workspaces.find(
      (workspace) => workspace.id === request.session?.workspaceId,
    ) ?? null
  );
}

function buildEffectiveContext(
  options: PromptProcessorOptions,
  request: PromptRequest,
) {
  const { chat, settings } = options.shell;
  return resolveEffectiveChatContext({
    session: request.session,
    workspace: resolveWorkspace(options, request),
    systemPrompt: settings.system.systemPrompt,
    personality: settings.system.personality,
    enableHtmlVisualPrompt: settings.system.enableHtmlVisualPrompt,
    selectedModel: chat.selectedModel,
    modelMetadata: settings.modelMetadata,
    customModelMetadata: settings.customModelMetadata,
    chatConfig: chat.chatConfig,
    searchAvailable: Boolean(settings.serverConfig?.search.available),
    rag: settings.rag,
    installedPlugins: settings.installedPlugins,
    installedSkills: settings.installedSkills,
    pluginConfigs: settings.pluginConfigs,
    activePlugins: settings.activePlugins,
  });
}

function resolveMemoryContext(
  options: PromptProcessorOptions,
  request: PromptRequest,
) {
  const state = useMemoryStore.getState();
  if (!state._hasHydrated || !state.settings.enabled) return null;
  if (!state.settings.searchEnabled) return null;
  return buildDirectMemoryPromptContext({
    memories: state.memories,
    query: request.text,
    alreadyInjectedMemoryIds: getSuppressedMemoryIds(
      request.session,
      options.shell.chat.activeMessages,
    ),
  });
}

async function preparePrompt(
  options: PromptProcessorOptions,
  request: PromptRequest,
): Promise<PreparedChatPrompt> {
  const { chat, settings, knowledgeCollections } = options.shell;
  const effectiveContext = buildEffectiveContext(options, request);
  const processed = await processMessageForSending({
    text: request.text,
    attachments: request.attachments,
    selectedModel: chat.selectedModel,
    modelMetadata: settings.modelMetadata,
    customModelMetadata: settings.customModelMetadata,
    ragConfig: settings.rag,
    ragEnabled: chat.chatConfig.useRAG !== false,
    knowledgeCollections,
    workspaceKnowledgeCollectionIds:
      effectiveContext.workspaceKnowledgeCollectionIds,
    signal: request.signal,
  });
  const memory = resolveMemoryContext(options, request);
  const memoryContext = memory?.text
    ? {
        injectedMemoryIds: memory.injectedMemoryIds,
        promptContext: memory.text,
        createdAt: Date.now(),
      }
    : undefined;
  return {
    ...processed,
    userMessage: memoryContext
      ? { ...processed.userMessage, memoryContext }
      : processed.userMessage,
    finalText: memory?.text
      ? appendContextToChatInput(processed.finalText, memory.text, {
          separator: "\n\n",
        })
      : processed.finalText,
    effectiveContext,
    injectedMemoryIds: memory?.injectedMemoryIds ?? [],
  };
}

function commitInjectedMemory(
  options: PromptProcessorOptions,
  request: {
    sessionId: string;
    session?: PromptRequest["session"];
    ids: string[];
  },
) {
  if (request.ids.length === 0) return;
  const existing = request.session?.memoryContext?.injectedMemoryIds ?? [];
  options.shell.chat.updateSessionMemoryContext(request.sessionId, {
    injectedMemoryIds: Array.from(new Set([...existing, ...request.ids])),
    updatedAt: Date.now(),
  });
}

export function usePromptProcessor(options: PromptProcessorOptions) {
  const processPrompt = useCallback(
    (request: PromptRequest) => preparePrompt(options, request),
    [options],
  );
  const commitMemory = useCallback(
    (request: Parameters<typeof commitInjectedMemory>[1]) =>
      commitInjectedMemory(options, request),
    [options],
  );
  return { processPrompt, commitMemory };
}
