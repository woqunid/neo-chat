"use client";

import { useCallback } from "react";

import {
  createBotMessagePlaceholder,
  getModelDisplayName,
} from "@/lib/chat/messageProcessor";
import { useChatStore } from "@/store/core/chatStore";
import type { Message, Session } from "@/types";

import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import type { PreparedChatPrompt } from "./shared";
import { createGenerationTiming } from "./shared";
import type { SendMessageNow } from "./useMessageQueue";
import { handleSendFailure } from "./sendMessageFailure";
import type {
  FailureProgress,
  NewTurn,
  SendMessageOptions,
  SendRequest,
} from "./sendMessageTypes";

function resolveSession(options: SendMessageOptions, request: SendRequest) {
  const state = useChatStore.getState();
  const sessionId =
    request.requestedSessionId ||
    state.currentSessionId ||
    options.shell.chat.createSession();
  if (!sessionId) return null;
  const session =
    options.shell.chat.sessions.find((item) => item.id === sessionId) ??
    useChatStore.getState().sessions.find((item) => item.id === sessionId);
  return { sessionId, session };
}

function shouldAutoRename(options: SendMessageOptions, session?: Session) {
  return Boolean(
    options.shell.settings.system.enableAutoTitle &&
    session?.messageCount === 0 &&
    session.title === "New Chat",
  );
}

async function prepareNewTurn(
  options: SendMessageOptions,
  request: {
    message: SendRequest;
    sessionId: string;
    session?: Session;
    signal: AbortSignal;
  },
) {
  const sessionForProcessing =
    useChatStore
      .getState()
      .sessions.find((item) => item.id === request.sessionId) ??
    request.session;
  const prepared = await options.processPrompt({
    session: sessionForProcessing,
    text: request.message.text,
    attachments: request.message.attachments,
    signal: request.signal,
  });
  return { prepared, sessionForProcessing };
}

async function createPersistedTurn(
  options: SendMessageOptions,
  request: {
    message: SendRequest;
    sessionId: string;
    session?: Session;
    modelName: string;
    generation: ActiveGenerationRun;
    onProgress: (progress: FailureProgress) => void;
  },
) {
  const preparedTurn = await prepareNewTurn(options, {
    ...request,
    signal: request.generation.controller.signal,
  });
  if (!options.generation.isGenerationRunActive(request.generation))
    return null;
  options.commitMemory({
    sessionId: request.sessionId,
    session: preparedTurn.sessionForProcessing,
    ids: preparedTurn.prepared.injectedMemoryIds,
  });
  await options.shell.chat.addMessage(
    request.sessionId,
    preparedTurn.prepared.userMessage,
  );
  request.onProgress({
    userMessageAdded: true,
    modelMessageId: null,
    startTime: Date.now(),
  });
  if (!options.generation.isGenerationRunActive(request.generation))
    return null;
  const turn = await persistNewTurn(options, {
    sessionId: request.sessionId,
    prepared: preparedTurn.prepared,
    modelName: request.modelName,
    onModelCreated: (message) =>
      request.onProgress({
        userMessageAdded: true,
        modelMessageId: message.id,
        startTime: message.timestamp,
      }),
  });
  return options.generation.isGenerationRunActive(request.generation)
    ? turn
    : null;
}

async function persistNewTurn(
  options: SendMessageOptions,
  request: {
    sessionId: string;
    prepared: PreparedChatPrompt;
    modelName: string;
    onModelCreated: (message: Message) => void;
  },
): Promise<NewTurn> {
  const modelMessage = createBotMessagePlaceholder(
    request.modelName,
    request.prepared.ragSources,
    request.prepared.ragError,
  );
  request.onModelCreated(modelMessage);
  await options.shell.chat.addMessage(request.sessionId, modelMessage);
  const state = useChatStore.getState();
  const session = state.sessions.find((item) => item.id === request.sessionId);
  if (!session) throw new Error("Session not found");
  return {
    session,
    prepared: request.prepared,
    userMessage: request.prepared.userMessage,
    modelMessage,
    history: state.activeMessages.filter(
      (message) => message.id !== request.prepared.userMessage.id,
    ),
  };
}

async function streamNewTurn(
  options: SendMessageOptions,
  request: {
    sessionId: string;
    turn: NewTurn;
    promptText: string;
    generation: ActiveGenerationRun;
  },
) {
  const history = await options.prepareResponseHistory({
    messages: request.turn.history,
    compression: request.turn.session.compression,
    generation: request.generation,
  });
  if (!history) return false;
  const skills = await options.resolveResponseSkills({
    promptText: request.promptText,
    prepared: request.turn.prepared,
    generation: request.generation,
  });
  if (!skills) return false;
  if (skills.invocations.length > 0) {
    options.shell.chat.updateMessage(
      request.sessionId,
      request.turn.modelMessage.id,
      { skillInvocations: skills.invocations },
    );
  }
  return options.streamResponse({
    sessionId: request.sessionId,
    userMessageId: request.turn.userMessage.id,
    modelMessageId: request.turn.modelMessage.id,
    promptText: request.promptText,
    prepared: request.turn.prepared,
    history,
    skills,
    generation: request.generation,
  });
}

async function completeNewTurn(
  options: SendMessageOptions,
  request: { sessionId: string; turn: NewTurn; autoRename: boolean },
) {
  const endTime = Date.now();
  options.shell.chat.updateMessage(
    request.sessionId,
    request.turn.modelMessage.id,
    {
      generationStatus: "completed",
      timing: createGenerationTiming(
        request.turn.modelMessage.timestamp,
        endTime,
      ),
    },
  );
  await options.shell.chat.syncActiveSession(request.sessionId);
  options.runPostGeneration({
    sessionId: request.sessionId,
    modelMessageId: request.turn.modelMessage.id,
    userMessage: request.turn.userMessage,
    shouldAutoRename: request.autoRename,
  });
}

async function executeSendMessage(
  options: SendMessageOptions,
  request: {
    message: SendRequest;
    sessionId: string;
    session?: Session;
    modelName: string;
    generation: ActiveGenerationRun;
    onProgress: (progress: FailureProgress) => void;
  },
) {
  const turn = await createPersistedTurn(options, request);
  if (!turn) return;
  const completed = await streamNewTurn(options, {
    sessionId: request.sessionId,
    turn,
    promptText: request.message.text,
    generation: request.generation,
  });
  if (!completed) return;
  await completeNewTurn(options, {
    sessionId: request.sessionId,
    turn,
    autoRename: shouldAutoRename(options, request.session),
  });
}

async function runSendMessage(
  options: SendMessageOptions,
  request: SendRequest,
) {
  const target = resolveSession(options, request);
  if (!target) return;
  const generation = options.generation.beginActiveGeneration();
  options.isGeneratingRef.current = true;
  const modelName = getModelDisplayName(
    options.shell.chat.selectedModel,
    options.availableModels,
  );
  let progress: FailureProgress = {
    userMessageAdded: false,
    modelMessageId: null,
    startTime: Date.now(),
  };
  try {
    await executeSendMessage(options, {
      message: request,
      sessionId: target.sessionId,
      session: target.session,
      modelName,
      generation,
      onProgress: (nextProgress) => {
        progress = nextProgress;
      },
    });
  } catch (error) {
    await handleSendFailure(options, {
      ...request,
      sessionId: target.sessionId,
      modelName,
      progress,
      generation,
      error,
    });
  } finally {
    options.generation.finishActiveGeneration(generation);
    options.isGeneratingRef.current = false;
  }
}

export function useSendMessageNow(options: SendMessageOptions): SendMessageNow {
  return useCallback(
    (text, attachments, requestedSessionId) =>
      runSendMessage(options, { text, attachments, requestedSessionId }),
    [options],
  );
}
