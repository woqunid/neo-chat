"use client";

import { useLocale } from "next-intl";

import { useBranchGeneration } from "../generation/useBranchGeneration";
import { useEditBranchGeneration } from "../generation/useEditBranchGeneration";
import { useGenerationPersistence } from "../generation/useGenerationPersistence";
import { useMessageQueue } from "../generation/useMessageQueue";
import { usePostGenerationTasks } from "../generation/usePostGenerationTasks";
import { usePromptProcessor } from "../generation/usePromptProcessor";
import { useSendMessageNow } from "../generation/useSendMessageNow";
import { useStreamingResponse } from "../generation/useStreamingResponse";
import type { ChatControllerBase } from "./useChatControllerBase";

function useGenerationInfrastructure(base: ChatControllerBase) {
  const persistence = useGenerationPersistence({
    shell: base.shell,
    generation: base.generation,
    showActionError: base.notice.showActionError,
  });
  const prompt = usePromptProcessor({ shell: base.shell });
  const streaming = useStreamingResponse({
    shell: base.shell,
    generation: base.generation,
    isUserScrollingRef: base.autoScroll.isUserScrollingRef,
    locale: useLocale(),
  });
  return { ...persistence, ...prompt, ...streaming };
}

export function useChatGenerationActions(base: ChatControllerBase) {
  const infrastructure = useGenerationInfrastructure(base);
  const common = {
    shell: base.shell,
    generation: base.generation,
    availableModels: base.availableModels,
    isGenerating: base.generation.isGenerating,
    isGeneratingRef: base.isGeneratingRef,
    showActionError: base.notice.showActionError,
    ...infrastructure,
  };
  const runPostGeneration = usePostGenerationTasks({
    shell: base.shell,
    queueMemoryExtraction: infrastructure.queueMemoryExtraction,
  });
  const sendMessageNow = useSendMessageNow({
    ...common,
    runPostGeneration,
  });
  const queue = useMessageQueue({
    shell: base.shell,
    isGenerating: base.generation.isGenerating,
    isGeneratingRef: base.isGeneratingRef,
    sendMessageNow,
  });
  const branch = useBranchGeneration(common);
  const handleSubmitUserEdit = useEditBranchGeneration(common);
  return {
    ...infrastructure,
    ...queue,
    ...branch,
    handleSubmitUserEdit,
    sendMessageNow,
  };
}

export type ChatGenerationActions = ReturnType<typeof useChatGenerationActions>;
