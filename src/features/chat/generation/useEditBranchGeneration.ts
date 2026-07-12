"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import {
  createBotMessagePlaceholder,
  getModelDisplayName,
} from "@/lib/chat/messageProcessor";
import { logDevError } from "@/lib/utils/devLogger";
import { useChatStore } from "@/store/core/chatStore";
import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { PreparedChatPrompt, StreamResponseRequest } from "./shared";
import {
  createGenerationTiming,
  getGenerationErrorMessage,
  isGenerationAbort,
} from "./shared";
import type {
  EditBranch,
  EditBranchOptions,
  EditSource,
} from "./editBranchTypes";

function resolveEditSource(
  options: EditBranchOptions,
  request: { messageId: string; content: string; errorMessage: string },
): EditSource | null {
  const sessionId = options.shell.chat.currentSessionId;
  if (!sessionId || options.isGenerating || !request.content.trim())
    return null;
  const messages = options.shell.chat.activeMessages;
  const messageIndex = messages.findIndex(
    (item) => item.id === request.messageId,
  );
  const sourceMessage = messages[messageIndex];
  if (!sourceMessage || sourceMessage.role !== "user") {
    options.showActionError(request.errorMessage);
    return null;
  }
  if (sourceMessage.content === request.content) return null;
  return {
    sessionId,
    sourceMessage,
    messageIndex,
    messages,
    session: options.shell.chat.getCurrentSession(),
  };
}

function createEditBranch(
  options: EditBranchOptions,
  request: {
    source: EditSource;
    prepared: PreparedChatPrompt;
    errorMessage: string;
  },
): EditBranch | null {
  const placeholder = createBotMessagePlaceholder(
    getModelDisplayName(
      options.shell.chat.selectedModel,
      options.availableModels,
    ),
    request.prepared.ragSources,
    request.prepared.ragError,
  );
  const ids = options.shell.chat.createEditedUserMessageBranch(
    request.source.sessionId,
    request.source.sourceMessage.id,
    request.prepared.userMessage,
    placeholder,
  );
  if (!ids) {
    options.showActionError(request.errorMessage);
    return null;
  }
  return {
    userMessageId: ids.userMessageId,
    modelMessageId: ids.modelMessageId,
    startTime: placeholder.timestamp,
  };
}

async function streamEditBranch(
  options: EditBranchOptions,
  request: {
    source: EditSource;
    branch: EditBranch;
    prepared: PreparedChatPrompt;
    skills: StreamResponseRequest["skills"];
    generation: ActiveGenerationRun;
    content: string;
  },
) {
  const history = await options.prepareResponseHistory({
    messages: request.source.messages.slice(0, request.source.messageIndex),
    compression: request.source.session?.compression,
    generation: request.generation,
  });
  if (!history) return false;
  return options.streamResponse({
    sessionId: request.source.sessionId,
    userMessageId: request.branch.userMessageId,
    modelMessageId: request.branch.modelMessageId,
    promptText: request.content,
    prepared: request.prepared,
    history,
    skills: request.skills,
    generation: request.generation,
  });
}

async function completeEditBranch(
  options: EditBranchOptions,
  request: { source: EditSource; branch: EditBranch; content: string },
) {
  options.shell.chat.updateMessage(
    request.source.sessionId,
    request.branch.modelMessageId,
    {
      generationStatus: "completed",
      timing: createGenerationTiming(request.branch.startTime, Date.now()),
    },
  );
  await options.shell.chat.syncActiveSession(request.source.sessionId);
  const message = useChatStore
    .getState()
    .activeMessages.find((item) => item.id === request.branch.modelMessageId);
  if (!message) return;
  options.queueMemoryExtraction({
    sessionId: request.source.sessionId,
    user: { id: request.branch.userMessageId, content: request.content },
    assistant: { id: message.id, content: message.content },
  });
}

async function handleEditFailure(
  options: EditBranchOptions,
  request: {
    source: EditSource;
    branch: EditBranch | null;
    generation: ActiveGenerationRun;
    errorMessage: string;
    error: unknown;
  },
) {
  if (isGenerationAbort(request.error, request.generation.controller.signal)) {
    if (!request.branch) return;
    await options.markAborted({
      sessionId: request.source.sessionId,
      messageId: request.branch.modelMessageId,
      logMessage: "Failed to persist aborted edited user message branch",
    });
    return;
  }
  logDevError("User message edit branch generation failed:", request.error);
  if (!request.branch) {
    options.showActionError(request.errorMessage);
    return;
  }
  options.shell.chat.updateMessage(
    request.source.sessionId,
    request.branch.modelMessageId,
    {
      generationStatus: "failed",
      generationError: {
        message: getGenerationErrorMessage(request.error),
        recoverable: true,
      },
      timing: createGenerationTiming(request.branch.startTime, Date.now()),
    },
  );
  await options.syncWithNotice({
    sessionId: request.source.sessionId,
    logMessage: "Failed to persist edited user message branch error",
  });
}

async function prepareEditInputs(
  options: EditBranchOptions,
  request: {
    source: EditSource;
    content: string;
    generation: ActiveGenerationRun;
  },
) {
  const prepared = await options.processPrompt({
    session: request.source.session,
    text: request.content,
    attachments: request.source.sourceMessage.attachments ?? [],
    signal: request.generation.controller.signal,
  });
  if (!options.generation.isGenerationRunActive(request.generation))
    return null;
  options.commitMemory({
    sessionId: request.source.sessionId,
    session: request.source.session,
    ids: prepared.injectedMemoryIds,
  });
  const skills = await options.resolveResponseSkills({
    promptText: request.content,
    prepared,
    generation: request.generation,
  });
  return skills ? { prepared, skills } : null;
}

async function runPreparedEdit(
  options: EditBranchOptions,
  request: {
    source: EditSource;
    branch: EditBranch;
    inputs: NonNullable<Awaited<ReturnType<typeof prepareEditInputs>>>;
    generation: ActiveGenerationRun;
    content: string;
  },
) {
  if (request.inputs.skills.invocations.length > 0) {
    options.shell.chat.updateMessage(
      request.source.sessionId,
      request.branch.modelMessageId,
      { skillInvocations: request.inputs.skills.invocations },
    );
  }
  const completed = await streamEditBranch(options, {
    source: request.source,
    branch: request.branch,
    prepared: request.inputs.prepared,
    skills: request.inputs.skills,
    generation: request.generation,
    content: request.content,
  });
  if (completed) {
    await completeEditBranch(options, {
      source: request.source,
      branch: request.branch,
      content: request.content,
    });
  }
}

async function runEditBranch(
  options: EditBranchOptions,
  request: { messageId: string; content: string; errorMessage: string },
) {
  const source = resolveEditSource(options, request);
  if (!source) return;
  const generation = options.generation.beginActiveGeneration();
  let branch: EditBranch | null = null;
  try {
    const inputs = await prepareEditInputs(options, {
      source,
      content: request.content,
      generation,
    });
    if (!inputs) return;
    branch = createEditBranch(options, {
      source,
      prepared: inputs.prepared,
      errorMessage: request.errorMessage,
    });
    if (!branch) return;
    await runPreparedEdit(options, {
      source,
      branch,
      inputs,
      generation,
      content: request.content,
    });
  } catch (error) {
    await handleEditFailure(options, {
      source,
      branch,
      generation,
      errorMessage: request.errorMessage,
      error,
    });
  } finally {
    options.generation.finishActiveGeneration(generation);
  }
}

export function useEditBranchGeneration(options: EditBranchOptions) {
  const t = useTranslations("ChatApp");
  return useCallback(
    (messageId: string, content: string) =>
      runEditBranch(options, {
        messageId,
        content,
        errorMessage: t("errEditUserMessage"),
      }),
    [options, t],
  );
}
