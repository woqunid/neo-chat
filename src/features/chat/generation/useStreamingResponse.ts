"use client";

import { useCallback } from "react";

import { resolveSkillsForMessage } from "@/services/api/skillService";
import { resolveEffectiveChatRequestConfig } from "@/lib/chat/effectiveChatConfig";
import { buildSearchUpdate } from "@/lib/chat/searchUpdate";
import { handleTokenUsageUpdate } from "@/lib/utils/message";
import { useChatStore } from "@/store/core/chatStore";
import {
  createStreamingMessageCommitter,
  type FrameScheduler,
} from "../streamingMessageCommitter";

import type { ChatGenerationController, ChatShellState } from "../runtimeTypes";
import type {
  PrepareHistoryRequest,
  ResolveSkillsRequest,
  StreamResponseRequest,
} from "./shared";

const loadChatService = () => import("@/services/api/chatService");
const BROWSER_FRAME_SCHEDULER: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (frameId) => window.cancelAnimationFrame(frameId),
};

interface StreamingResponseOptions {
  shell: ChatShellState;
  generation: ChatGenerationController;
  isUserScrollingRef: React.MutableRefObject<boolean>;
  locale: string;
}

function createCommitter(
  options: StreamingResponseOptions,
  request: StreamResponseRequest,
) {
  return createStreamingMessageCommitter({
    scheduler: BROWSER_FRAME_SCHEDULER,
    shouldDefer: () => options.isUserScrollingRef.current,
    commit: ({ content, reasoning, outputBlocks }) => {
      options.shell.chat.updateMessageContent(
        request.sessionId,
        request.modelMessageId,
        content,
        reasoning,
        outputBlocks,
      );
    },
  });
}

function updateSearch(
  options: StreamingResponseOptions,
  update: {
    request: StreamResponseRequest;
    isSearching: boolean;
    results?: Parameters<typeof buildSearchUpdate>[2];
  },
) {
  const { request, isSearching, results } = update;
  if (!options.generation.isGenerationRunActive(request.generation)) return;
  const message = useChatStore
    .getState()
    .activeMessages.find((item) => item.id === request.modelMessageId);
  options.shell.chat.updateMessage(request.sessionId, request.modelMessageId, {
    ...buildSearchUpdate(message, isSearching, results),
    generationStatus: "streaming",
  });
}

function appendImages(
  options: StreamingResponseOptions,
  request: StreamResponseRequest,
  images: Parameters<
    NonNullable<
      import("@/services/api/chat/streamTypes").StreamChatResponseArgs[10]
    >
  >[0],
) {
  if (!options.generation.isGenerationRunActive(request.generation)) return;
  const message = useChatStore
    .getState()
    .activeMessages.find((item) => item.id === request.modelMessageId);
  options.shell.chat.updateMessage(request.sessionId, request.modelMessageId, {
    attachments: [...(message?.attachments ?? []), ...images],
    generationStatus: "streaming",
  });
}

function createCallbacks(
  options: StreamingResponseOptions,
  request: StreamResponseRequest,
) {
  const committer = createCommitter(options, request);
  const isActive = () =>
    options.generation.isGenerationRunActive(request.generation);
  return {
    committer,
    onChunk: (
      content: string,
      reasoning?: string,
      outputBlocks?: import("@/types").MessageOutputBlock[],
    ) => {
      if (isActive()) committer.enqueue({ content, reasoning, outputBlocks });
    },
    onSearch: (
      isSearching: boolean,
      results?: Parameters<typeof buildSearchUpdate>[2],
    ) => updateSearch(options, { request, isSearching, results }),
    onTools: (toolCalls: import("@/types").ToolCall[]) => {
      if (isActive())
        options.shell.chat.updateMessage(
          request.sessionId,
          request.modelMessageId,
          { toolCalls, generationStatus: "streaming" },
        );
    },
    onImages: (images: import("@/types").Attachment[]) =>
      appendImages(options, request, images),
    onUsage: (usage: unknown) => {
      if (!isActive()) return;
      handleTokenUsageUpdate(
        usage,
        useChatStore.getState().activeMessages,
        request.userMessageId,
        request.modelMessageId,
        request.sessionId,
        options.shell.chat.updateMessage,
      );
    },
    onOutputBlocks: (outputBlocks: import("@/types").MessageOutputBlock[]) => {
      if (isActive()) committer.enqueue({ outputBlocks });
    },
    requestToolConfirmation: async (
      confirmation: import("@/services/api/chat/streamTypes").ToolConfirmationRequest,
    ) => {
      if (!isActive()) return false;
      const args = JSON.stringify(confirmation.toolCall.args ?? {}, null, 2);
      return window.confirm(
        [
          `工具“${confirmation.toolCall.name}”请求执行。`,
          `来源：${confirmation.pluginTitle}`,
          `风险：${confirmation.risk}`,
          `参数：\n${args.slice(0, 4_000)}`,
          "\n是否允许本次执行？",
        ].join("\n"),
      );
    },
  };
}

async function prepareHistory(
  options: StreamingResponseOptions,
  request: PrepareHistoryRequest,
) {
  const service = await loadChatService();
  const history = await service.prepareHistoryForLLM(
    request.messages,
    request.compression,
    options.shell.chat.selectedModel,
  );
  return options.generation.isGenerationRunActive(request.generation)
    ? history
    : null;
}

async function resolveSkills(
  options: StreamingResponseOptions,
  request: ResolveSkillsRequest,
) {
  const skills = await resolveSkillsForMessage({
    message: request.promptText,
    selectedModel: options.shell.chat.selectedModel,
    locale: options.locale,
    installedSkills: options.shell.settings.installedSkills,
    activeSkillIds: request.prepared.effectiveContext.activeSkillIds,
    autoSelect: options.shell.settings.skillAutoSelect,
    signal: request.generation.controller.signal,
  });
  return options.generation.isGenerationRunActive(request.generation)
    ? skills
    : null;
}

async function runStream(
  options: StreamingResponseOptions,
  request: StreamResponseRequest,
) {
  if (!options.generation.isGenerationRunActive(request.generation))
    return false;
  const callbacks = createCallbacks(options, request);
  const config = resolveEffectiveChatRequestConfig({
    chatConfig: options.shell.chat.chatConfig,
    selectedModel: options.shell.chat.selectedModel,
    modelMetadata: options.shell.settings.modelMetadata,
    customModelMetadata: options.shell.settings.customModelMetadata,
  });
  const service = await loadChatService();
  try {
    await service.streamChatResponse(
      request.sessionId,
      options.shell.chat.selectedModel,
      request.history,
      request.prepared.finalText,
      request.prepared.finalAttachments,
      config,
      callbacks.onChunk,
      request.prepared.effectiveContext.systemInstruction,
      callbacks.onSearch,
      callbacks.onTools,
      callbacks.onImages,
      callbacks.onUsage,
      request.generation.controller.signal,
      request.prepared.effectiveContext.activePluginIds,
      request.skills.context,
      callbacks.onOutputBlocks,
      callbacks.requestToolConfirmation,
    );
  } finally {
    callbacks.committer.flush();
  }
  return options.generation.isGenerationRunActive(request.generation);
}

export function useStreamingResponse(options: StreamingResponseOptions) {
  const streamResponse = useCallback(
    (request: StreamResponseRequest) => runStream(options, request),
    [options],
  );
  const prepareResponseHistory = useCallback(
    (request: PrepareHistoryRequest) => prepareHistory(options, request),
    [options],
  );
  const resolveResponseSkills = useCallback(
    (request: ResolveSkillsRequest) => resolveSkills(options, request),
    [options],
  );
  return { streamResponse, prepareResponseHistory, resolveResponseSkills };
}
