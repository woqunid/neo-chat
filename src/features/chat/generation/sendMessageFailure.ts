import { v7 as uuidv7 } from "uuid";

import { createBotMessagePlaceholder } from "@/lib/chat/messageProcessor";
import { logDevError } from "@/lib/utils/devLogger";

import type { ActiveGenerationRun } from "../hooks/useChatGenerationController";
import {
  createGenerationTiming,
  getGenerationErrorMessage,
  isGenerationAbort,
} from "./shared";
import type {
  FailureProgress,
  SendMessageOptions,
  SendRequest,
} from "./sendMessageTypes";

async function ensureUserMessage(
  options: SendMessageOptions,
  request: SendRequest & { sessionId: string; alreadyAdded: boolean },
) {
  if (request.alreadyAdded) return;
  await options.shell.chat.addMessage(request.sessionId, {
    id: uuidv7(),
    role: "user",
    content: request.text,
    timestamp: Date.now(),
    attachments: request.attachments,
  });
}

async function persistFailureModel(
  options: SendMessageOptions,
  request: {
    sessionId: string;
    modelName: string;
    progress: FailureProgress;
    errorMessage: string;
  },
) {
  const update = {
    generationStatus: "failed" as const,
    generationError: { message: request.errorMessage, recoverable: true },
    timing: createGenerationTiming(request.progress.startTime, Date.now()),
  };
  if (request.progress.modelMessageId) {
    options.shell.chat.updateMessage(
      request.sessionId,
      request.progress.modelMessageId,
      update,
    );
    return;
  }
  const message = createBotMessagePlaceholder(request.modelName, []);
  Object.assign(message, update);
  await options.shell.chat.addMessage(request.sessionId, message);
}

export async function handleSendFailure(
  options: SendMessageOptions,
  request: SendRequest & {
    sessionId: string;
    modelName: string;
    progress: FailureProgress;
    generation: ActiveGenerationRun;
    error: unknown;
  },
) {
  if (isGenerationAbort(request.error, request.generation.controller.signal)) {
    if (request.progress.modelMessageId) {
      await options.markAborted({
        sessionId: request.sessionId,
        messageId: request.progress.modelMessageId,
        logMessage: "Failed to persist aborted generation message",
      });
    }
    return;
  }
  logDevError("Generating content failed:", request.error);
  await ensureUserMessage(options, {
    ...request,
    alreadyAdded: request.progress.userMessageAdded,
  });
  await persistFailureModel(options, {
    ...request,
    errorMessage: getGenerationErrorMessage(request.error),
  });
  await options.shell.chat.syncActiveSession(request.sessionId);
}
